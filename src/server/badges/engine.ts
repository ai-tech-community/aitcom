/**
 * The badge engine (ADR-0039): the one place badges are earned.
 *
 * Source code names the track that may have changed
 * (`evaluateBadges(db, userId, ["writer"])`); the engine reads the track's
 * metric from its source of truth and inserts every tier now reached. The
 * `(user_id, badge_slug)` unique index makes it idempotent, so calling it
 * twice, or over every member as a backfill, is safe.
 *
 * Earning never breaks the action that triggered it: each call runs in its
 * own transaction (a savepoint when the caller passes a transaction), and a
 * failure is logged and swallowed.
 */
import { sql } from "drizzle-orm";

import {
  BADGE_SLUGS,
  LIMITED_EDITIONS,
  reachedTiers,
  type BadgeSlug,
  type BadgeTrackId,
  type LimitedEditionSlug,
  type MilestoneSlug,
} from "@/lib/badges/catalog";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import {
  activityEvents,
  memberBadges,
  memberProfiles,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

import { TRACK_METRICS, type BadgeDb, type BadgeSources } from "./metrics";
import { notifyBadgesEarned } from "./notify";

export type { BadgeDb } from "./metrics";

export interface EarnOptions {
  /** A collection hook's request, so metrics see its uncommitted write. */
  req?: BadgeSources["req"];
  /**
   * Retroactive earning (the backfill): record the badge only. No XP
   * bonus, activity event or notification for something earned long ago.
   */
  retroactive?: boolean;
}

/** XP granted once, when the badge row is actually created. */
const EARNING_XP: Partial<Record<BadgeSlug, number>> = {
  first_event: XP_AMOUNTS.FIRST_EVENT_BONUS,
  profile_complete: XP_AMOUNTS.PROFILE_COMPLETE,
  onboarding_complete: XP_AMOUNTS.ONBOARDING_COMPLETE,
};

const CATALOG_ORDER = new Map(BADGE_SLUGS.map((slug, index) => [slug, index]));

/**
 * Inserts the given badges, skipping the ones the member holds, and
 * returns the newly earned slugs in catalog order. Only new rows get their
 * XP bonus, activity event and notification.
 */
async function recordEarned(
  db: BadgeDb,
  userId: string,
  slugs: readonly BadgeSlug[],
  options: EarnOptions,
): Promise<BadgeSlug[]> {
  if (slugs.length === 0) return [];
  const rows = await db
    .insert(memberBadges)
    .values(slugs.map((badgeSlug) => ({ userId, badgeSlug })))
    .onConflictDoNothing()
    .returning({ id: memberBadges.id, badgeSlug: memberBadges.badgeSlug });
  const earned = rows
    .map((row) => ({ ...row, badgeSlug: row.badgeSlug as BadgeSlug }))
    .sort(
      (a, b) =>
        (CATALOG_ORDER.get(a.badgeSlug) ?? 0) -
        (CATALOG_ORDER.get(b.badgeSlug) ?? 0),
    );
  if (earned.length === 0 || options.retroactive) {
    return earned.map((row) => row.badgeSlug);
  }

  for (const row of earned) {
    const xp = EARNING_XP[row.badgeSlug];
    if (xp) await awardXp(db, userId, xp);
  }
  // A system event: earning is a consequence, not something the member
  // did, so it never counts as an active day.
  await db.insert(activityEvents).values(
    earned.map((row) => ({
      actorId: userId,
      actorType: "system",
      action: "badge.earned",
      targetType: "member_badge",
      targetId: row.id,
      metadata: { badgeSlug: row.badgeSlug },
    })),
  );
  await notifyBadgesEarned(
    db,
    userId,
    earned.map((row) => row.badgeSlug),
  );
  return earned.map((row) => row.badgeSlug);
}

/** Runs `work` in its own transaction or savepoint; logs and swallows failure. */
async function safely(
  db: BadgeDb,
  label: string,
  work: (tx: BadgeDb) => Promise<BadgeSlug[]>,
): Promise<BadgeSlug[]> {
  try {
    return await db.transaction((tx) => work(tx));
  } catch (err) {
    console.error(`badges: ${label} failed`, err);
    return [];
  }
}

/** The track tiers a metric value reaches, recorded for the member. */
async function recordTiers(
  db: BadgeDb,
  userId: string,
  track: BadgeTrackId,
  metric: number,
  options: EarnOptions,
): Promise<BadgeSlug[]> {
  return recordEarned(
    db,
    userId,
    reachedTiers(track, metric).map((badge) => badge.slug),
    options,
  );
}

/**
 * Reads each track's metric for the member and records every tier reached.
 * Returns the badges newly earned by this call.
 */
export async function evaluateBadges(
  db: BadgeDb,
  userId: string,
  tracks: readonly BadgeTrackId[],
  options: EarnOptions = {},
): Promise<BadgeSlug[]> {
  return safely(
    db,
    `evaluating ${tracks.join(", ")} for ${userId}`,
    async (tx) => {
      const sources: BadgeSources = {
        db: tx,
        payload: getPayloadClient,
        req: options.req,
      };
      const earned: BadgeSlug[] = [];
      for (const track of tracks) {
        const metric = await TRACK_METRICS[track](sources, userId);
        earned.push(...(await recordTiers(tx, userId, track, metric, options)));
      }
      return earned;
    },
  );
}

/**
 * Records the tiers a metric the caller already computed reaches, for a
 * caller that reads one track for many members at once (benchmark
 * coverage). Returns the badges newly earned.
 */
export async function recordTrackMetric(
  db: BadgeDb,
  userId: string,
  track: BadgeTrackId,
  metric: number,
  options: EarnOptions = {},
): Promise<BadgeSlug[]> {
  return safely(db, `recording ${track} for ${userId}`, (tx) =>
    recordTiers(tx, userId, track, metric, options),
  );
}

/**
 * Records a milestone the caller has just seen happen (its trigger stays
 * at the source). Returns whether it was newly earned.
 */
export async function awardMilestone(
  db: BadgeDb,
  userId: string,
  slug: MilestoneSlug,
  options: EarnOptions = {},
): Promise<boolean> {
  const earned = await safely(db, `awarding ${slug} to ${userId}`, (tx) =>
    recordEarned(tx, userId, [slug], options),
  );
  return earned.length > 0;
}

/**
 * Early adopter: one of the first `editionSize` members, judged by the
 * number of profiles when the member signs up.
 */
export async function awardEarlyAdopterIfEligible(
  db: BadgeDb,
  userId: string,
): Promise<boolean> {
  const slug: LimitedEditionSlug = "early_adopter";
  const earned = await safely(
    db,
    `awarding ${slug} to ${userId}`,
    async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberProfiles);
      if (Number(row?.n ?? 0) > LIMITED_EDITIONS[slug].editionSize) return [];
      return recordEarned(tx, userId, [slug], {});
    },
  );
  return earned.length > 0;
}
