import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import {
  activityEvents,
  communityMemberships,
  memberProfiles,
  user,
} from "@/server/db/schema";
import {
  CONTRIBUTION_ACTIONS,
  summarizeHealth,
  selectAtRisk,
  selectUnactivated,
  windowStart,
  type ActivityRow,
  type MembershipRow,
} from "@/server/communities/insights";

const WINDOW_DAYS = 14;
const PRIOR_WINDOW_DAYS = 45;
const NEWCOMER_MIN_AGE_DAYS = 3;
const AT_RISK_CAP = 50;

// CONTRIBUTION_ACTIONS is a readonly tuple; Drizzle inArray wants string[].
const CONTRIBUTION_ACTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

function requireAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const insightsRouter = createTRPCRouter({
  healthPulse: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
    requireAdmin(ctx.communityRole);
    const now = new Date();
    const since = windowStart(now, PRIOR_WINDOW_DAYS); // widest needed window

    const events = await ctx.db
      .select({
        actorId: activityEvents.actorId,
        action: activityEvents.action,
        createdAt: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.communityId, ctx.community.id),
          gte(activityEvents.createdAt, since),
        ),
      );

    const contributions = events.filter((e) =>
      CONTRIBUTION_ACTION_LIST.includes(e.action),
    ) as ActivityRow[];
    const joins = events.filter(
      (e) => e.action === "community.joined",
    ) as ActivityRow[];
    const departures = events.filter(
      (e) => e.action === "community.left",
    ) as ActivityRow[];

    return summarizeHealth({
      contributions,
      joins,
      departures,
      now,
      windowDays: WINDOW_DAYS,
    });
  }),

  atRiskMembers: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
    requireAdmin(ctx.communityRole);
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
        .where(eq(communityMemberships.communityId, ctx.community.id)),
      ctx.db
        .select({
          actorId: activityEvents.actorId,
          action: activityEvents.action,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            gte(activityEvents.createdAt, since),
            inArray(activityEvents.action, CONTRIBUTION_ACTION_LIST),
          ),
        ),
    ]);

    const atRisk = selectAtRisk({
      memberships: memberships as MembershipRow[],
      contributions: events as ActivityRow[],
      now,
      windowDays: WINDOW_DAYS,
      priorWindowDays: PRIOR_WINDOW_DAYS,
      cap: AT_RISK_CAP,
    });

    if (atRisk.length === 0) return [];

    const userIds = atRisk.map((m) => m.userId);
    const profileRows = await ctx.db
      .select({
        userId: memberProfiles.userId,
        displayName: memberProfiles.displayName,
        image: user.image,
      })
      .from(memberProfiles)
      .innerJoin(user, eq(memberProfiles.userId, user.id))
      .where(inArray(memberProfiles.userId, userIds));

    const profileMap = new Map(
      profileRows.map((r) => [
        r.userId,
        { displayName: r.displayName, image: r.image },
      ]),
    );

    return atRisk.map((m) => ({
      ...m,
      ...(profileMap.get(m.userId) ?? { displayName: null, image: null }),
    }));
  }),

  unactivatedNewcomers: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
    requireAdmin(ctx.communityRole);
    const now = new Date();

    const [memberships, events] = await Promise.all([
      ctx.db
        .select({
          userId: communityMemberships.userId,
          role: communityMemberships.role,
          status: communityMemberships.status,
          joinedAt: communityMemberships.joinedAt,
        })
        .from(communityMemberships)
        .where(eq(communityMemberships.communityId, ctx.community.id)),
      // No time filter — "never contributed ever" requires all-time contribution rows
      ctx.db
        .select({
          actorId: activityEvents.actorId,
          action: activityEvents.action,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            inArray(activityEvents.action, CONTRIBUTION_ACTION_LIST),
          ),
        ),
    ]);

    const newcomers = selectUnactivated({
      memberships: memberships as MembershipRow[],
      contributions: events as ActivityRow[],
      now,
      minAgeDays: NEWCOMER_MIN_AGE_DAYS,
    });

    if (newcomers.length === 0) return [];

    const userIds = newcomers.map((m) => m.userId);
    const profileRows = await ctx.db
      .select({
        userId: memberProfiles.userId,
        displayName: memberProfiles.displayName,
        image: user.image,
      })
      .from(memberProfiles)
      .innerJoin(user, eq(memberProfiles.userId, user.id))
      .where(inArray(memberProfiles.userId, userIds));

    const profileMap = new Map(
      profileRows.map((r) => [
        r.userId,
        { displayName: r.displayName, image: r.image },
      ]),
    );

    return newcomers.map((m) => ({
      ...m,
      ...(profileMap.get(m.userId) ?? { displayName: null, image: null }),
    }));
  }),
});
