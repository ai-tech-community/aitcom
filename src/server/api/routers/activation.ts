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
  type ActivationConfig,
  type FunnelMemberInput,
} from "@/server/communities/activation";
import {
  CONTRIBUTION_ACTIONS,
  windowStart,
} from "@/server/communities/insights";

const ACTIVATION_COHORT_DAYS = 30;
const GREETER_GRACE_HOURS = 48;
// Drizzle inArray wants string[]; the source tuples are readonly.
const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];
const RESPONSE_LIST: string[] = [...RESPONSE_ACTIONS];
const RESPONDABLE_CONTRIB: string[] = ["thread.create", "feed.post_created"];
const DEFAULT_CONFIG: ActivationConfig = {
  requireResponse: true,
  requireProfileComplete: false,
  windowDays: 7,
};

function requireAdmin(role: string | null) {
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

      const [cfgRow] = await ctx.db
        .select()
        .from(communityActivationConfig)
        .where(eq(communityActivationConfig.communityId, ctx.community.id))
        .limit(1);
      const config: ActivationConfig = cfgRow
        ? {
            requireResponse: cfgRow.requireResponse,
            requireProfileComplete: cfgRow.requireProfileComplete,
            windowDays: cfgRow.windowDays,
          }
        : DEFAULT_CONFIG;

      const memberships = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.status, "active"),
            gte(communityMemberships.joinedAt, cohortStart),
          ),
        );
      if (memberships.length === 0) {
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
      const cohortIds = memberships.map((m) => m.userId);

      const contribEvents = await ctx.db
        .select({
          actorId: activityEvents.actorId,
          createdAt: activityEvents.createdAt,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.communityId, ctx.community.id),
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

      const members: FunnelMemberInput[] = memberships.map((m) => ({
        userId: m.userId,
        firstContributionAt: firstContribution.get(m.userId) ?? null,
        firstResponseReceivedAt: firstResponse.get(m.userId) ?? null,
        profileComplete: profileComplete.get(m.userId) ?? false,
      }));
      return selectActivationFunnel({ members, config, now });
    }),

  awaitingResponse: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      requireAdmin(ctx.communityRole);
      const now = new Date();
      const cohortStart = windowStart(now, ACTIVATION_COHORT_DAYS);

      const [cfgRow] = await ctx.db
        .select()
        .from(communityActivationConfig)
        .where(eq(communityActivationConfig.communityId, ctx.community.id))
        .limit(1);
      const windowDays = cfgRow?.windowDays ?? DEFAULT_CONFIG.windowDays;

      const memberships = await ctx.db
        .select({ userId: communityMemberships.userId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, ctx.community.id),
            eq(communityMemberships.status, "active"),
            gte(communityMemberships.joinedAt, cohortStart),
          ),
        );
      if (memberships.length === 0) return [];
      const cohortIds = memberships.map((m) => m.userId);

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
            inArray(activityEvents.actorId, cohortIds),
            inArray(activityEvents.action, RESPONDABLE_CONTRIB),
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
