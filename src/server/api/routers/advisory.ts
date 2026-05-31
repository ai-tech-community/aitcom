import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";

import {
  agentProcedure,
  protectedProcedure,
  requireScope,
  requireOwner,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  agentDrafts,
  agentSuggestions,
  communities,
  communityMemberships,
  memberProfiles,
  activityEvents,
  introductions,
  conversations,
  conversationParticipants,
  messages,
} from "@/server/db/schema";
import type { db as _db } from "@/server/db";
import {
  canAdvise,
  nextIntroStatus,
  type IntroResponse,
} from "@/server/agents/advisory";
import {
  pairKey,
  scoreIntroductions,
  type MemberProfile,
} from "@/server/agents/matching";
import {
  CONTRIBUTION_ACTIONS,
  selectAtRisk,
  windowStart,
  type ActivityRow,
  type MembershipRow,
} from "@/server/communities/insights";

type DB = typeof _db;

const WINDOW_DAYS = 14;
const PRIOR_WINDOW_DAYS = 45;
const AT_RISK_CAP = 50;
const INTRO_CANDIDATE_CAP = 20;

// CONTRIBUTION_ACTIONS is a readonly tuple; Drizzle inArray wants string[].
const CONTRIBUTION_ACTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

/** Resolve the community for an advisory call; assert the agent's owner is an
 *  active admin/owner AND the community autonomy level is "suggest". */
async function requireAdvisoryAccess(db: DB, slug: string, ownerId: string) {
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
  });
  if (!community)
    throw new TRPCError({ code: "NOT_FOUND", message: "Community not found" });

  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, ownerId),
      eq(communityMemberships.status, "active"),
    ),
  });
  if (
    !membership ||
    (membership.role !== "owner" && membership.role !== "admin")
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Requires admin/owner of this community",
    });
  }

  if (!canAdvise(community.autonomyLevel)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Agent advisory is off for this community",
    });
  }

  return community;
}

export const advisoryRouter = createTRPCRouter({
  /** At-risk members the agent can draft revival nudges for. */
  atRiskMembers: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(
        ctx.db,
        input.slug,
        ownerId,
      );

      const now = new Date();
      const since = windowStart(now, PRIOR_WINDOW_DAYS);

      const [memberships, events] = await Promise.all([
        ctx.db
          .select({
            userId: communityMemberships.userId,
            role: communityMemberships.role,
            status: communityMemberships.status,
            joinedAt: communityMemberships.joinedAt,
          })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, community.id),
              eq(communityMemberships.status, "active"),
            ),
          ),
        ctx.db
          .select({
            actorId: activityEvents.actorId,
            action: activityEvents.action,
            createdAt: activityEvents.createdAt,
          })
          .from(activityEvents)
          .where(
            and(
              eq(activityEvents.communityId, community.id),
              gte(activityEvents.createdAt, since),
              inArray(activityEvents.action, CONTRIBUTION_ACTION_LIST),
            ),
          ),
      ]);

      return selectAtRisk({
        memberships: memberships as MembershipRow[],
        contributions: events as ActivityRow[],
        now,
        windowDays: WINDOW_DAYS,
        priorWindowDays: PRIOR_WINDOW_DAYS,
        cap: AT_RISK_CAP,
      });
    }),

  /** Ranked candidate member pairs to introduce, with shared interests/skills. */
  introCandidates: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(
        ctx.db,
        input.slug,
        ownerId,
      );

      const rows = await ctx.db
        .select({
          userId: communityMemberships.userId,
          interests: memberProfiles.interests,
          skills: memberProfiles.skills,
        })
        .from(communityMemberships)
        .innerJoin(
          memberProfiles,
          eq(memberProfiles.userId, communityMemberships.userId),
        )
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
          ),
        );

      const members: MemberProfile[] = rows.map((r) => ({
        userId: r.userId,
        interests: r.interests ?? [],
        skills: r.skills ?? [],
      }));

      const existing = await ctx.db
        .select({ pairKey: introductions.pairKey })
        .from(introductions)
        .where(
          and(
            eq(introductions.communityId, community.id),
            ne(introductions.status, "declined"),
          ),
        );
      const excludePairs = new Set(existing.map((e) => e.pairKey));

      return scoreIntroductions({
        members,
        excludePairs,
        cap: INTRO_CANDIDATE_CAP,
      });
    }),

  /** File an introduction suggestion for the organizer to review. */
  suggestIntroduction: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        userIdA: z.string(),
        userIdB: z.string(),
        reason: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(
        ctx.db,
        input.slug,
        ownerId,
      );
      if (input.userIdA === input.userIdB) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot introduce a member to themselves",
        });
      }
      const members = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.status, "active"),
            inArray(communityMemberships.userId, [
              input.userIdA,
              input.userIdB,
            ]),
          ),
        );
      if (members.length !== 2) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Both users must be active members",
        });
      }
      const key = pairKey(input.userIdA, input.userIdB);
      const open = await ctx.db
        .select({ id: introductions.id })
        .from(introductions)
        .where(
          and(
            eq(introductions.communityId, community.id),
            eq(introductions.pairKey, key),
            ne(introductions.status, "declined"),
          ),
        )
        .limit(1);
      if (open.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An introduction for this pair already exists",
        });
      }
      const [s] = await ctx.db
        .insert(agentSuggestions)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "introduction",
          title: "Introduce two members",
          content: input.reason,
          metadata: {
            communityId: community.id,
            communitySlug: input.slug,
            userIdA: input.userIdA,
            userIdB: input.userIdB,
            pairKey: key,
          },
        })
        .returning({ id: agentSuggestions.id });
      return { suggestionId: s!.id };
    }),

  /** File a revival-nudge draft for an at-risk member, for the organizer to review/send. */
  suggestRevival: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        memberUserId: z.string(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(
        ctx.db,
        input.slug,
        ownerId,
      );
      const member = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, community.id),
            eq(communityMemberships.userId, input.memberUserId),
            eq(communityMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (member.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Target is not an active member",
        });
      }
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "revival_nudge",
          targetType: "user",
          targetId: input.memberUserId,
          content: input.message,
          metadata: { communityId: community.id, communitySlug: input.slug },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),

  /** The caller's pending introductions (for the member consent surface).
   *  Returns no info about the OTHER member until both consent. */
  myPendingIntroductions: protectedProcedure.query(async ({ ctx }) => {
    const me = ctx.session.user.id;
    return ctx.db
      .select({
        introId: introductions.id,
        communityId: introductions.communityId,
        sharedInterests: introductions.sharedInterests,
      })
      .from(introductions)
      .where(
        and(
          eq(introductions.status, "pending_consent"),
          or(eq(introductions.userIdA, me), eq(introductions.userIdB, me)),
        ),
      );
  }),

  /** A member accepts/declines an introduction. When BOTH accept, a DM opens. */
  respondToIntroduction: protectedProcedure
    .input(z.object({ introId: z.string(), accept: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const [intro] = await ctx.db
        .select()
        .from(introductions)
        .where(eq(introductions.id, input.introId))
        .limit(1);
      if (!intro || (intro.userIdA !== userId && intro.userIdB !== userId)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Introduction not found",
        });
      }
      if (intro.status !== "pending_consent") {
        return { status: intro.status, conversationId: intro.conversationId };
      }
      const isA = intro.userIdA === userId;
      const myResponse: IntroResponse = input.accept ? "accepted" : "declined";
      const responseA = isA ? myResponse : intro.responseA;
      const responseB = isA ? intro.responseB : myResponse;
      const status = nextIntroStatus(responseA, responseB);

      let conversationId = intro.conversationId;
      if (status === "connected") {
        // neon-http has no interactive transactions; dedupe like inbox.startConversation
        const [existingDm] = await ctx.db
          .select({ conversationId: conversationParticipants.conversationId })
          .from(conversationParticipants)
          .innerJoin(
            conversations,
            eq(conversations.id, conversationParticipants.conversationId),
          )
          .where(
            and(
              eq(conversations.type, "dm"),
              eq(conversationParticipants.userId, intro.userIdB),
              sql`${conversationParticipants.conversationId} IN (
                SELECT ${conversationParticipants.conversationId} FROM ${conversationParticipants} WHERE ${conversationParticipants.userId} = ${intro.userIdA}
              )`,
            ),
          )
          .limit(1);

        if (existingDm) {
          conversationId = existingDm.conversationId;
        } else {
          const [conv] = await ctx.db
            .insert(conversations)
            .values({ type: "dm" })
            .returning();
          await ctx.db.insert(conversationParticipants).values([
            { conversationId: conv!.id, userId: intro.userIdA },
            { conversationId: conv!.id, userId: intro.userIdB },
          ]);
          conversationId = conv!.id;
        }
        await ctx.db.insert(messages).values({
          conversationId: conversationId,
          senderId: intro.organizerId,
          senderType: "human",
          content: "You both opted in to connect — say hi! 👋",
        });
      }
      await ctx.db
        .update(introductions)
        .set({ responseA, responseB, status, conversationId })
        .where(eq(introductions.id, intro.id));
      return { status, conversationId };
    }),
});
