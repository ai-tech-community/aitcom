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
import type { db as _db } from "@/server/db";
import { sendDirectMessage } from "@/server/inbox/dm";
import {
  CONTRIBUTION_ACTIONS,
  AT_RISK_WINDOW_DAYS,
  AT_RISK_PRIOR_WINDOW_DAYS,
  AT_RISK_CAP,
  summarizeHealth,
  selectAtRisk,
  selectUnactivated,
  windowStart,
  type ActivityRow,
} from "@/server/communities/insights";
import {
  loadAtRiskInputs,
  loadUnactivatedInputs,
} from "@/server/communities/insights-queries";

type DB = typeof _db;

export const NEWCOMER_MIN_AGE_DAYS = 3;
export const NEWCOMER_MAX_AGE_DAYS = 30;

// CONTRIBUTION_ACTIONS is a readonly tuple; Drizzle inArray wants string[].
const CONTRIBUTION_ACTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];

function requireManager(role: string | null) {
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
      requireManager(ctx.communityRole);
      const now = new Date();
      const since = windowStart(now, AT_RISK_WINDOW_DAYS * 2); // 28 days — 2× window is all summarizeHealth needs

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
        windowDays: AT_RISK_WINDOW_DAYS,
      });
    }),

  atRiskMembers: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireManager(ctx.communityRole);
      const now = new Date();

      const { memberships, contributions } = await loadAtRiskInputs(
        ctx.db,
        ctx.community.id,
        now,
      );

      const atRisk = selectAtRisk({
        memberships,
        contributions,
        now,
        windowDays: AT_RISK_WINDOW_DAYS,
        priorWindowDays: AT_RISK_PRIOR_WINDOW_DAYS,
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
      requireManager(ctx.communityRole);
      const now = new Date();

      const { memberships, contributorUserIds } = await loadUnactivatedInputs(
        ctx.db,
        ctx.community.id,
      );

      const newcomers = selectUnactivated({
        memberships,
        contributorUserIds,
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

  /** Organizer sends a warm-welcome DM (in their own name) to an un-activated
   *  newcomer. owner/admin/moderator only; target must be an active member. */
  sendWelcome: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        memberUserId: z.string(),
        message: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireManager(ctx.communityRole);
      if (input.memberUserId === ctx.session.user.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot welcome yourself",
        });
      }
      const [m] = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.userId, input.memberUserId),
            eq(communityMemberships.status, "active"),
          ),
        )
        .limit(1);
      if (!m) throw new TRPCError({ code: "NOT_FOUND" });
      await sendDirectMessage(
        ctx.db,
        ctx.session.user.id,
        input.memberUserId,
        input.message,
      );
      return { ok: true };
    }),
});
