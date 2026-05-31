import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNull, ne } from "drizzle-orm";

import {
  agentProcedure,
  requireScope,
  requireOwner,
  createTRPCRouter,
} from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  memberProfiles,
  activityEvents,
  introductions,
} from "@/server/db/schema";
import { db as _db } from "@/server/db";
import { canAdvise } from "@/server/agents/advisory";
import {
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
});
