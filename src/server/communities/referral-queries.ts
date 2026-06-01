/** Assembles activation signals for referred-but-uncredited members so the
 *  reconcile cron can decide referral credit. Raw-fetch + reduce (neon-http). */

import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";

import {
  communityMemberships,
  communityActivationConfig,
  communityAcquireConfig,
  activityEvents,
  memberProfiles,
  referralCredits,
} from "@/server/db/schema";
import {
  RESPONSE_ACTIONS,
  DEFAULT_ACTIVATION_CONFIG,
} from "@/server/communities/activation";
import type { ActivationConfig } from "@/server/communities/activation";
import {
  CONTRIBUTION_ACTIONS,
  windowStart,
} from "@/server/communities/insights";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

const CONTRIBUTION_LIST: string[] = [...CONTRIBUTION_ACTIONS];
const RESPONSE_LIST: string[] = [...RESPONSE_ACTIONS];

/**
 * How far back to scan for referral candidates: activation cohort (~30 d) +
 * max activation window (30 d) + buffer (5 d) = 65 d.  Members who joined more
 * than 65 days ago can no longer activate in time to earn the referrer credit,
 * so re-scanning them every cron run is wasteful.
 */
export const REFERRAL_SCAN_DAYS = 65;

export type ReferralCandidate = {
  referredUserId: string;
  referrerId: string;
  communityId: string;
  firstContributionAt: Date | null;
  firstResponseReceivedAt: Date | null;
  profileComplete: boolean;
  config: ActivationConfig;
};

export async function loadReferralCandidates(
  db: DB,
  now: Date,
): Promise<ReferralCandidate[]> {
  // Only consider memberships joined within the last REFERRAL_SCAN_DAYS days.
  // Members older than this window can no longer activate in time to earn credit.
  const scanStart = windowStart(now, REFERRAL_SCAN_DAYS);

  // Referred, active memberships (invitedBy set) within the scan window.
  const memberships = await db
    .select({
      userId: communityMemberships.userId,
      communityId: communityMemberships.communityId,
      invitedBy: communityMemberships.invitedBy,
    })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.status, "active"),
        isNotNull(communityMemberships.invitedBy),
        gte(communityMemberships.joinedAt, scanStart),
      ),
    );
  if (memberships.length === 0) return [];

  const userIds = [...new Set(memberships.map((m) => m.userId))];
  const communityIds = [...new Set(memberships.map((m) => m.communityId))];

  // Communities with referrals DISABLED (referralsEnabled === false). Missing row => enabled.
  const acquireCfgs = await db
    .select({
      communityId: communityAcquireConfig.communityId,
      referralsEnabled: communityAcquireConfig.referralsEnabled,
    })
    .from(communityAcquireConfig)
    .where(inArray(communityAcquireConfig.communityId, communityIds));
  const referralsDisabled = new Set(
    acquireCfgs
      .filter((c) => c.referralsEnabled === false)
      .map((c) => c.communityId),
  );

  // Exclude users who already have ANY referral credit (one credit per member, global).
  const credited = await db
    .select({ referredUserId: referralCredits.referredUserId })
    .from(referralCredits)
    .where(inArray(referralCredits.referredUserId, userIds));
  const creditedSet = new Set(credited.map((c) => c.referredUserId));

  const pending = memberships.filter(
    (m) =>
      m.invitedBy !== null &&
      !creditedSet.has(m.userId) &&
      !referralsDisabled.has(m.communityId),
  );
  if (pending.length === 0) return [];

  // First contribution per (community, user).
  const contribRows = await db
    .select({
      communityId: activityEvents.communityId,
      actorId: activityEvents.actorId,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.communityId, communityIds),
        inArray(activityEvents.actorId, userIds),
        inArray(activityEvents.action, CONTRIBUTION_LIST),
      ),
    );
  const firstContribution = new Map<string, Date>();
  for (const r of contribRows) {
    if (!r.communityId) continue;
    const key = `${r.communityId}:${r.actorId}`;
    const cur = firstContribution.get(key);
    if (!cur || r.createdAt < cur) firstContribution.set(key, r.createdAt);
  }

  // First response received per (community, user) — recipientId=user, actor≠user.
  const responseRows = await db
    .select({
      communityId: activityEvents.communityId,
      recipientId: activityEvents.recipientId,
      actorId: activityEvents.actorId,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        inArray(activityEvents.communityId, communityIds),
        inArray(activityEvents.recipientId, userIds),
        inArray(activityEvents.action, RESPONSE_LIST),
      ),
    );
  const firstResponse = new Map<string, Date>();
  for (const r of responseRows) {
    if (!r.communityId || !r.recipientId || r.recipientId === r.actorId)
      continue;
    const key = `${r.communityId}:${r.recipientId}`;
    const cur = firstResponse.get(key);
    if (!cur || r.createdAt < cur) firstResponse.set(key, r.createdAt);
  }

  // Profile-complete flags.
  const profiles = await db
    .select({
      userId: memberProfiles.userId,
      onboardingCompleted: memberProfiles.onboardingCompleted,
      interests: memberProfiles.interests,
      experienceLevel: memberProfiles.experienceLevel,
    })
    .from(memberProfiles)
    .where(inArray(memberProfiles.userId, userIds));
  const profileComplete = new Map<string, boolean>();
  for (const p of profiles) {
    profileComplete.set(
      p.userId,
      p.onboardingCompleted &&
        (p.interests?.length ?? 0) >= 1 &&
        !!p.experienceLevel,
    );
  }

  // Activation config per community.
  const cfgRows = await db
    .select()
    .from(communityActivationConfig)
    .where(inArray(communityActivationConfig.communityId, communityIds));
  const cfgMap = new Map(cfgRows.map((c) => [c.communityId, c]));

  return pending.map((m) => {
    const key = `${m.communityId}:${m.userId}`;
    const cfg = cfgMap.get(m.communityId);
    return {
      referredUserId: m.userId,
      referrerId: m.invitedBy!,
      communityId: m.communityId,
      firstContributionAt: firstContribution.get(key) ?? null,
      firstResponseReceivedAt: firstResponse.get(key) ?? null,
      profileComplete: profileComplete.get(m.userId) ?? false,
      config: cfg
        ? {
            requireResponse: cfg.requireResponse,
            requireProfileComplete: cfg.requireProfileComplete,
            windowDays: cfg.windowDays,
          }
        : DEFAULT_ACTIVATION_CONFIG,
    };
  });
}

export type LeaderboardRow = {
  userId: string;
  name: string | null;
  referralCount: number;
};

/** Hub-global referral counts (a view over the credit ledger). */
export async function loadReferralLeaderboard(
  db: DB,
  limit: number,
): Promise<LeaderboardRow[]> {
  const rows = await db
    .select({
      userId: referralCredits.referrerId,
      name: memberProfiles.displayName,
      referralCount: sql<number>`count(*)::int`,
    })
    .from(referralCredits)
    .innerJoin(
      memberProfiles,
      eq(memberProfiles.userId, referralCredits.referrerId),
    )
    .where(eq(memberProfiles.isPublic, true))
    .groupBy(referralCredits.referrerId, memberProfiles.displayName)
    .orderBy(desc(sql`count(*)`), asc(referralCredits.referrerId))
    .limit(limit);
  return rows;
}
