import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, gte, inArray, isNotNull } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
import {
  activityEvents,
  communityMemberships,
  communityActivationConfig,
  memberProfiles,
  user,
} from "@/server/db/schema";
import {
  selectActivationFunnel,
  RESPONSE_ACTIONS,
  RESPONDABLE_ACTIONS,
  type ActivationConfig,
  type FunnelMemberInput,
} from "@/server/communities/activation";
import {
  CONTRIBUTION_ACTIONS,
  windowStart,
} from "@/server/communities/insights";
import type { db as _db } from "@/server/db";

type ActivationDb = typeof _db;

const ACTIVATION_COHORT_DAYS = 30;
const GREETER_GRACE_HOURS = 48;
// Drizzle inArray wants string[]; the source tuples are readonly.
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];
const RESPONSE_LIST: string[] = [...RESPONSE_ACTIONS];
const RESPONDABLE_LIST: string[] = [...RESPONDABLE_ACTIONS];
const DEFAULT_CONFIG: ActivationConfig = {
  requireResponse: true,
  requireProfileComplete: false,
  windowDays: 7,
};

async function loadCohort(
  db: ActivationDb,
  communityId: string,
  cohortStart: Date,
): Promise<{ config: ActivationConfig; cohortIds: string[] }> {
  const [cfgRow] = await db
    .select()
    .from(communityActivationConfig)
    .where(eq(communityActivationConfig.communityId, communityId))
    .limit(1);
  const config: ActivationConfig = cfgRow
    ? {
        requireResponse: cfgRow.requireResponse,
        requireProfileComplete: cfgRow.requireProfileComplete,
        windowDays: cfgRow.windowDays,
      }
    : DEFAULT_CONFIG;
  const memberships = await db
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
        gte(communityMemberships.joinedAt, cohortStart),
      ),
    );
  return { config, cohortIds: memberships.map((m) => m.userId) };
}

function requireAdmin(role: "owner" | "admin" | "moderator" | "member" | null) {
  if (role !== "owner" && role !== "admin" && role !== "moderator") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

function earliestByKey<T>(
  rows: T[],
  keyOf: (r: T) => string,
  dateOf: (r: T) => Date,
): Map<string, Date> {
  const m = new Map<string, Date>();
  for (const r of rows) {
    const k = keyOf(r);
    const d = dateOf(r);
    const cur = m.get(k);
    if (!cur || d < cur) m.set(k, d);
  }
  return m;
}

export const activationRouter = createTRPCRouter({
  funnel: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.communityRole);
      const now = new Date();
      const cohortStart = windowStart(now, ACTIVATION_COHORT_DAYS);

      const { config, cohortIds } = await loadCohort(
        ctx.db,
        ctx.community.id,
        cohortStart,
      );
      if (cohortIds.length === 0) {
        return {
          cohortSize: 0,
          contributed: 0,
          responded: 0,
          activated: 0,
          byStage: {
            unactivated: 0,
            awaiting_response: 0,
            awaiting_profile: 0,
            activated: 0,
            stalled: 0,
          },
        };
      }

      const contribEvents = await ctx.db
        .select({
          actorId: activityEvents.actorId,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            gte(activityEvents.createdAt, cohortStart),
            inArray(activityEvents.actorId, cohortIds),
            inArray(activityEvents.action, CONTRIBUTION_LIST),
          ),
        );
      const firstContribution = earliestByKey(
        contribEvents,
        (e) => e.actorId,
        (e) => e.createdAt,
      );

      const responseEvents = await ctx.db
        .select({
          recipientId: activityEvents.recipientId,
          actorId: activityEvents.actorId,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            gte(activityEvents.createdAt, cohortStart),
            isNotNull(activityEvents.recipientId),
            inArray(activityEvents.recipientId, cohortIds),
            inArray(activityEvents.action, RESPONSE_LIST),
          ),
        );
      // recipientId is non-null here (isNotNull above), and we exclude self-responses.
      const otherResponses = responseEvents.flatMap((e) =>
        e.recipientId !== null && e.recipientId !== e.actorId
          ? [{ recipientId: e.recipientId, createdAt: e.createdAt }]
          : [],
      );
      const firstResponse = earliestByKey(
        otherResponses,
        (e) => e.recipientId,
        (e) => e.createdAt,
      );

      const profiles = await ctx.db
        .select({
          userId: memberProfiles.userId,
          onboardingCompleted: memberProfiles.onboardingCompleted,
          interests: memberProfiles.interests,
          experienceLevel: memberProfiles.experienceLevel,
        })
        .from(memberProfiles)
        .where(inArray(memberProfiles.userId, cohortIds));
      const profileComplete = new Map<string, boolean>(
        profiles.map((p) => [
          p.userId,
          !!p.onboardingCompleted &&
            (p.interests?.length ?? 0) >= 1 &&
            !!p.experienceLevel,
        ]),
      );

      const members: FunnelMemberInput[] = cohortIds.map((userId) => ({
        userId,
        firstContributionAt: firstContribution.get(userId) ?? null,
        firstResponseReceivedAt: firstResponse.get(userId) ?? null,
        profileComplete: profileComplete.get(userId) ?? false,
      }));
      return selectActivationFunnel({ members, config, now });
    }),

  awaitingResponse: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.communityRole);
      const now = new Date();
      const cohortStart = windowStart(now, ACTIVATION_COHORT_DAYS);

      const { config, cohortIds } = await loadCohort(
        ctx.db,
        ctx.community.id,
        cohortStart,
      );
      if (cohortIds.length === 0) return [];
      const windowDays = config.windowDays;

      const respondable = await ctx.db
        .select({
          actorId: activityEvents.actorId,
          action: activityEvents.action,
          targetType: activityEvents.targetType,
          targetId: activityEvents.targetId,
          metadata: activityEvents.metadata,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            gte(activityEvents.createdAt, cohortStart),
            inArray(activityEvents.actorId, cohortIds),
            inArray(activityEvents.action, RESPONDABLE_LIST),
          ),
        );
      const earliestRespondable = new Map<
        string,
        (typeof respondable)[number]
      >();
      for (const e of respondable) {
        const cur = earliestRespondable.get(e.actorId);
        if (!cur || e.createdAt < cur.createdAt) {
          earliestRespondable.set(e.actorId, e);
        }
      }

      const responseEvents = await ctx.db
        .select({
          recipientId: activityEvents.recipientId,
          actorId: activityEvents.actorId,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
            gte(activityEvents.createdAt, cohortStart),
            isNotNull(activityEvents.recipientId),
            inArray(activityEvents.recipientId, cohortIds),
            inArray(activityEvents.action, RESPONSE_LIST),
          ),
        );
      const respondedSet = new Set<string>(
        responseEvents.flatMap((e) =>
          e.recipientId !== null && e.recipientId !== e.actorId
            ? [e.recipientId]
            : [],
        ),
      );

      const graceMs = GREETER_GRACE_HOURS * 60 * 60 * 1000;
      const windowMs = windowDays * 24 * 60 * 60 * 1000;
      const queue = [...earliestRespondable.entries()]
        .filter(([userId, e]) => {
          if (respondedSet.has(userId)) return false;
          const ageMs = now.getTime() - e.createdAt.getTime();
          return ageMs >= graceMs && ageMs <= windowMs;
        })
        .map(([userId, e]) => ({
          userId,
          action: e.action,
          targetType: e.targetType,
          targetId: e.targetId,
          metadata: e.metadata,
          contributionAt: e.createdAt,
        }));
      if (queue.length === 0) return [];

      const ids = queue.map((q) => q.userId);
      const profileRows = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          image: user.image,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(memberProfiles.userId, user.id))
        .where(inArray(memberProfiles.userId, ids));
      const pmap = new Map(
        profileRows.map((r) => [
          r.userId,
          { displayName: r.displayName, image: r.image },
        ]),
      );
      return queue
        .map((q) => ({
          ...q,
          ...(pmap.get(q.userId) ?? { displayName: null, image: null }),
        }))
        .sort(
          (a, b) => a.contributionAt.getTime() - b.contributionAt.getTime(),
        );
    }),
});
