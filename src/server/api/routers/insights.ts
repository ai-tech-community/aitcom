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
import { db as _db } from "@/server/db";
import {
  CONTRIBUTION_ACTIONS,
  summarizeHealth,
  selectAtRisk,
  selectUnactivated,
  windowStart,
  type ActivityRow,
  type MembershipRow,
} from "@/server/communities/insights";

type DB = typeof _db;

const WINDOW_DAYS = 14;
const PRIOR_WINDOW_DAYS = 45;
const NEWCOMER_MIN_AGE_DAYS = 3;
const NEWCOMER_MAX_AGE_DAYS = 30;
const AT_RISK_CAP = 50;

// CONTRIBUTION_ACTIONS is a readonly tuple; Drizzle inArray wants string[].
const CONTRIBUTION_ACTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

function requireAdmin(role: string | null) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

/** Fetch display-name + avatar for a list of user IDs. Returns an empty map for empty input. */
async function hydrateProfiles(
  database: DB,
  userIds: string[],
): Promise<Map<string, { displayName: string | null; image: string | null }>> {
  if (userIds.length === 0) return new Map();

  const profileRows = await database
    .select({
      userId: memberProfiles.userId,
      displayName: memberProfiles.displayName,
      image: user.image,
    })
    .from(memberProfiles)
    .innerJoin(user, eq(memberProfiles.userId, user.id))
    .where(inArray(memberProfiles.userId, userIds));

  return new Map(
    profileRows.map((r) => [
      r.userId,
      { displayName: r.displayName, image: r.image },
    ]),
  );
}

export const insightsRouter = createTRPCRouter({
  healthPulse: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.communityRole);
      const now = new Date();
      const since = windowStart(now, WINDOW_DAYS * 2); // 28 days — 2× window is all summarizeHealth needs

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
            inArray(activityEvents.action, [
              ...CONTRIBUTION_ACTION_LIST,
              "community.joined",
              "community.left",
            ]),
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
          .where(
            and(
              eq(communityMemberships.communityId, ctx.community.id),
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
      const profileMap = await hydrateProfiles(ctx.db, userIds);

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

      const [memberships, contributorRows] = await Promise.all([
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
              eq(communityMemberships.communityId, ctx.community.id),
              eq(communityMemberships.status, "active"),
            ),
          ),
        ctx.db
          .selectDistinct({ actorId: activityEvents.actorId })
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
        contributorUserIds: contributorRows.map((r) => r.actorId),
        now,
        minAgeDays: NEWCOMER_MIN_AGE_DAYS,
        maxAgeDays: NEWCOMER_MAX_AGE_DAYS,
      });

      if (newcomers.length === 0) return [];

      const userIds = newcomers.map((m) => m.userId);
      const profileMap = await hydrateProfiles(ctx.db, userIds);

      return newcomers.map((m) => ({
        ...m,
        ...(profileMap.get(m.userId) ?? { displayName: null, image: null }),
      }));
    }),
});
