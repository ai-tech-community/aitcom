import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";

import {
  NEWCOMER_MIN_AGE_DAYS,
  NEWCOMER_MAX_AGE_DAYS,
} from "@/server/api/routers/insights";

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
  introductions,
  conversations,
  conversationParticipants,
  messages,
  notifications,
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
  AT_RISK_WINDOW_DAYS,
  AT_RISK_PRIOR_WINDOW_DAYS,
  AT_RISK_CAP,
  selectAtRisk,
  selectUnactivated,
  windowStart,
} from "@/server/communities/insights";
import {
  loadAtRiskInputs,
  loadUnactivatedInputs,
} from "@/server/communities/insights-queries";
import { loadAwaitingResponse } from "@/server/communities/activation-queries";

type DB = typeof _db;

const INTRO_CANDIDATE_CAP = 20;
const NEW_JOINER_CAP = 100;

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

      const { memberships, contributions } = await loadAtRiskInputs(
        ctx.db,
        community.id,
        now,
      );

      return selectAtRisk({
        memberships,
        contributions,
        now,
        windowDays: AT_RISK_WINDOW_DAYS,
        priorWindowDays: AT_RISK_PRIOR_WINDOW_DAYS,
        cap: AT_RISK_CAP,
      });
    }),

  /** New joiners (within the last N days) the agent can suggest introductions for. */
  newJoinerIntroCandidates: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        days: z.number().int().min(1).max(30).default(14),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(
        ctx.db,
        input.slug,
        ownerId,
      );

      const since = windowStart(new Date(), input.days);
      const joiners = await ctx.db
        .select({
          userId: communityMemberships.userId,
          joinedAt: communityMemberships.joinedAt,
          displayName: memberProfiles.displayName,
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
            gte(communityMemberships.joinedAt, since),
          ),
        )
        .orderBy(desc(communityMemberships.joinedAt))
        .limit(NEW_JOINER_CAP);
      return joiners;
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

      // bounded to keep the O(n^2) pair scan tractable
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
        )
        .orderBy(communityMemberships.userId)
        .limit(500);

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
      // Compute shared interests/skills for the suggestion metadata so
      // approveIntroduction can pass them through to the introduction row.
      const profiles = await ctx.db
        .select({
          userId: memberProfiles.userId,
          interests: memberProfiles.interests,
          skills: memberProfiles.skills,
        })
        .from(memberProfiles)
        .where(inArray(memberProfiles.userId, [input.userIdA, input.userIdB]));
      const pa = profiles.find((p) => p.userId === input.userIdA);
      const pb = profiles.find((p) => p.userId === input.userIdB);
      const setB = new Set([...(pb?.interests ?? []), ...(pb?.skills ?? [])]);
      const sharedInterests = [
        ...new Set([...(pa?.interests ?? []), ...(pa?.skills ?? [])]),
      ].filter((x) => setB.has(x));

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
            sharedInterests,
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

  /** Un-activated newcomers the agent can draft warm-welcome nudges for. */
  unactivatedNewcomers: agentProcedure
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

      const { memberships, contributorUserIds } = await loadUnactivatedInputs(
        ctx.db,
        community.id,
      );

      return selectUnactivated({
        memberships,
        contributorUserIds,
        now,
        minAgeDays: NEWCOMER_MIN_AGE_DAYS,
        maxAgeDays: NEWCOMER_MAX_AGE_DAYS,
      });
    }),

  /** File a warm-welcome draft for an un-activated newcomer, for the organizer to review/send. */
  suggestWelcome: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        memberUserId: z.string(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute"); // MATCH suggestRevival
      const ownerId = requireOwner(ctx.agent.ownerId);
      if (input.memberUserId === ownerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot welcome yourself",
        });
      }
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
          type: "welcome_nudge",
          targetType: "user",
          targetId: input.memberUserId,
          content: input.message,
          metadata: { communityId: community.id, communitySlug: input.slug },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),

  /** Newcomers whose first respondable post is still unanswered (greeter queue). */
  newcomersAwaitingResponse: agentProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);
      const community = await requireAdvisoryAccess(
        ctx.db,
        input.slug,
        ownerId,
      );
      return loadAwaitingResponse(ctx.db, community.id, new Date());
    }),

  /** Draft a greeting reply to a newcomer's thread. Note: the threadId is not
   *  validated to belong to {slug}'s community — like all thread_reply drafts it
   *  is owner-scoped at review (only the agent's owner can approve), so blast
   *  radius is the owner's own drafts. A community-scoped validation is a
   *  tracked follow-up.
   *
   *  Draft a warm reply to a newcomer's unanswered first post, for an admin to
   *  review and post in their own name (published via reviewDraft thread_reply). */
  suggestGreeting: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        threadId: z.number(),
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
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "thread_reply",
          targetType: "forum-threads",
          targetId: String(input.threadId),
          content: input.message,
          metadata: {
            communityId: community.id,
            communitySlug: input.slug,
            greeting: true,
          },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),

  /** Draft a community broadcast for an admin/owner to review and send in their name. */
  suggestBroadcast: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
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
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "broadcast",
          targetType: "community",
          targetId: community.id,
          content: input.body,
          metadata: {
            communityId: community.id,
            communitySlug: input.slug,
            subject: input.subject,
          },
        })
        .returning({ id: agentDrafts.id });
      return { draftId: d!.id };
    }),

  /** Draft a ritual definition for an admin to approve (never created directly). */
  suggestRitual: agentProcedure
    .input(
      z.object({
        slug: z.string(),
        title: z.string().min(3).max(255),
        body: z.string().min(1).max(10000),
        category: z
          .enum(["general", "question", "showcase", "job"])
          .default("general"),
        weekday: z.number().int().min(0).max(6),
        mode: z.enum(["auto", "review"]).default("review"),
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
      const [d] = await ctx.db
        .insert(agentDrafts)
        .values({
          agentId: ctx.agent.agentId,
          ownerId,
          type: "ritual_suggestion",
          targetType: "community",
          targetId: community.id,
          content: input.title,
          metadata: {
            communityId: community.id,
            communitySlug: input.slug,
            title: input.title,
            body: input.body,
            category: input.category,
            weekday: input.weekday,
            mode: input.mode,
          },
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

      // 1. Write ONLY the caller's own response, guarded on still-pending (no clobber of the other side).
      await ctx.db
        .update(introductions)
        .set(isA ? { responseA: myResponse } : { responseB: myResponse })
        .where(
          and(
            eq(introductions.id, intro.id),
            eq(introductions.status, "pending_consent"),
          ),
        );

      // 2. Re-read authoritative responses.
      const [fresh] = await ctx.db
        .select()
        .from(introductions)
        .where(eq(introductions.id, intro.id))
        .limit(1);
      if (!fresh)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Introduction not found",
        });

      // 3. Compute status from the authoritative responses.
      const status = nextIntroStatus(fresh.responseA, fresh.responseB);

      if (status === "connected") {
        // Claim the connect atomically FIRST (single winner), THEN create the DM —
        // so a concurrent double-accept can't create two conversations.
        const wonConnect = await ctx.db
          .update(introductions)
          .set({ status: "connected" })
          .where(
            and(
              eq(introductions.id, intro.id),
              eq(introductions.status, "pending_consent"),
            ),
          )
          .returning({ id: introductions.id });

        if (wonConnect.length === 0) {
          // Someone else already connected this intro — return the authoritative conversationId.
          const [row] = await ctx.db
            .select({ conversationId: introductions.conversationId })
            .from(introductions)
            .where(eq(introductions.id, intro.id))
            .limit(1);
          return {
            status: "connected" as const,
            conversationId: row?.conversationId ?? null,
          };
        }

        // We won: dedupe/create the DM, persist it on the intro, post the opener.
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
              eq(conversationParticipants.userId, fresh.userIdB),
              sql`${conversationParticipants.conversationId} IN (
                SELECT ${conversationParticipants.conversationId} FROM ${conversationParticipants} WHERE ${conversationParticipants.userId} = ${fresh.userIdA}
              )`,
            ),
          )
          .limit(1);
        let conversationId: string;
        if (existingDm) {
          conversationId = existingDm.conversationId;
        } else {
          const [conv] = await ctx.db
            .insert(conversations)
            .values({ type: "dm" })
            .returning();
          await ctx.db.insert(conversationParticipants).values([
            { conversationId: conv!.id, userId: fresh.userIdA },
            { conversationId: conv!.id, userId: fresh.userIdB },
          ]);
          conversationId = conv!.id;
        }
        await ctx.db
          .update(introductions)
          .set({ conversationId })
          .where(eq(introductions.id, intro.id));
        await ctx.db.insert(messages).values({
          conversationId,
          senderId: fresh.userIdA,
          senderType: "human",
          content: "You both opted in to connect — say hi! 👋",
        });
        // Mark both members' introduction_request notifications read.
        await ctx.db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              inArray(notifications.userId, [fresh.userIdA, fresh.userIdB]),
              eq(notifications.type, "introduction_request"),
              sql`${notifications.metadata}->>'introId' = ${intro.id}`,
            ),
          );
        return { status: "connected" as const, conversationId };
      }
      if (status === "declined") {
        await ctx.db
          .update(introductions)
          .set({ status: "declined" })
          .where(
            and(
              eq(introductions.id, intro.id),
              eq(introductions.status, "pending_consent"),
            ),
          );
        // Mark both members' introduction_request notifications read.
        await ctx.db
          .update(notifications)
          .set({ readAt: new Date() })
          .where(
            and(
              inArray(notifications.userId, [fresh.userIdA, fresh.userIdB]),
              eq(notifications.type, "introduction_request"),
              sql`${notifications.metadata}->>'introId' = ${intro.id}`,
            ),
          );
        return { status: "declined" as const, conversationId: null };
      }
      return {
        status: "pending_consent" as const,
        conversationId: fresh.conversationId,
      };
    }),
});
