/**
 * The badge engine (ADR-0039): the one place badges are earned.
 *
 * Source code names the track that may have changed
 * (`evaluateBadges(db, userId, ["writer"])`); the engine reads the track's
 * metric from its source of truth and inserts every tier now reached. The
 * `(user_id, badge_slug)` unique index makes it idempotent, so calling it
 * twice, or over every member as a backfill, is safe. Only the tier the
 * triggering action reached is celebrated (see `trackEarnings`).
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

import { trackEarnings, type Earning } from "./celebration";
import { TRACK_METRICS, type BadgeDb, type BadgeSources } from "./metrics";
import { notifyBadgesEarned } from "./notify";
import { clearBadgeRarityCache } from "./rarity";

export type { BadgeDb } from "./metrics";
export { trackEarnings, type Earning } from "./celebration";

export interface EarnOptions {
  /** A collection hook's request, so metrics see its uncommitted write. */
  req?: BadgeSources["req"];
}

/** What one evaluation did. It never throws; `ok` is false when it failed. */
export interface EarnOutcome {
  ok: boolean;
  /** Badges newly recorded, in catalog order. */
  earned: BadgeSlug[];
  /** The subset this action reached: XP bonus, event and notification. */
  celebrated: BadgeSlug[];
}

/** XP granted once, when a celebrated badge row is actually created. */
const EARNING_XP: Partial<Record<BadgeSlug, number>> = {
  first_event: XP_AMOUNTS.FIRST_EVENT_BONUS,
  profile_complete: XP_AMOUNTS.PROFILE_COMPLETE,
  onboarding_complete: XP_AMOUNTS.ONBOARDING_COMPLETE,
};

const CATALOG_ORDER = new Map(BADGE_SLUGS.map((slug, index) => [slug, index]));

/**
 * Inserts the given badges, skipping the ones the member holds. New rows
 * marked `celebrate` get their XP bonus, activity event and notification,
 * and stay unseen (`seen_at` null) so the earning moment shows them once;
 * the others are recorded silently, already seen.
 */
async function recordEarned(
  db: BadgeDb,
  userId: string,
  earnings: readonly Earning[],
): Promise<Omit<EarnOutcome, "ok">> {
  if (earnings.length === 0) return { earned: [], celebrated: [] };
  const celebrate = new Set(
    earnings.filter((e) => e.celebrate).map((e) => e.slug),
  );
  const rows = await db
    .insert(memberBadges)
    .values(
      earnings.map(({ slug, celebrate: celebrated }) => ({
        userId,
        badgeSlug: slug,
        seenAt: celebrated ? null : sql`now()`,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: memberBadges.id, badgeSlug: memberBadges.badgeSlug });
  const earned = rows
    .map((row) => ({ ...row, badgeSlug: row.badgeSlug as BadgeSlug }))
    .sort(
      (a, b) =>
        (CATALOG_ORDER.get(a.badgeSlug) ?? 0) -
        (CATALOG_ORDER.get(b.badgeSlug) ?? 0),
    );
  const celebrated = earned.filter((row) => celebrate.has(row.badgeSlug));

  for (const row of celebrated) {
    const xp = EARNING_XP[row.badgeSlug];
    if (xp) await awardXp(db, userId, xp);
  }
  if (celebrated.length > 0) {
    // A system event: earning is a consequence, not something the member
    // did, so it never counts as an active day.
    await db.insert(activityEvents).values(
      celebrated.map((row) => ({
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
      celebrated.map((row) => row.badgeSlug),
    );
  }
  return {
    earned: earned.map((row) => row.badgeSlug),
    celebrated: celebrated.map((row) => row.badgeSlug),
  };
}

/**
 * Runs `work` in its own transaction or savepoint, so a failure rolls back
 * only the badge writes; logs and reports it instead of throwing.
 */
async function safely(
  db: BadgeDb,
  label: string,
  work: (tx: BadgeDb) => Promise<Omit<EarnOutcome, "ok">>,
): Promise<EarnOutcome> {
  try {
    const outcome = await db.transaction((tx) => work(tx));
    // After the commit: clearing inside the transaction could let another
    // request re-cache a count without the new row for the whole TTL.
    if (outcome.earned.length > 0) clearBadgeRarityCache();
    return { ok: true, ...outcome };
  } catch (err) {
    console.error(`badges: ${label} failed`, err);
    return { ok: false, earned: [], celebrated: [] };
  }
}

/**
 * Reads each track's metric for the member and records every tier reached,
 * celebrating only the tier this action reached.
 */
export async function evaluateBadges(
  db: BadgeDb,
  userId: string,
  tracks: readonly BadgeTrackId[],
  options: EarnOptions = {},
): Promise<EarnOutcome> {
  return safely(
    db,
    `evaluating ${tracks.join(", ")} for ${userId}`,
    async (tx) => {
      const sources: BadgeSources = {
        db: tx,
        payload: getPayloadClient,
        req: options.req,
      };
      const earnings: Earning[] = [];
      for (const track of tracks) {
        const metric = await TRACK_METRICS[track](sources, userId);
        earnings.push(...trackEarnings(track, metric));
      }
      return recordEarned(tx, userId, earnings);
    },
  );
}

/**
 * Records the tiers a metric the caller already computed reaches, for a
 * caller that reads one track for many members at once (benchmark
 * coverage). Same celebration rule as `evaluateBadges`.
 */
export async function recordTrackMetric(
  db: BadgeDb,
  userId: string,
  track: BadgeTrackId,
  metric: number,
): Promise<EarnOutcome> {
  return safely(db, `recording ${track} for ${userId}`, (tx) =>
    recordEarned(tx, userId, trackEarnings(track, metric)),
  );
}

/**
 * The backfill's write: records every tier the metric reaches silently, in
 * one transaction. Unlike the live entry points it throws on failure, so
 * the backfill can report it. Returns the badges newly recorded.
 */
export async function recordRetroactiveTiers(
  db: BadgeDb,
  userId: string,
  track: BadgeTrackId,
  metric: number,
): Promise<BadgeSlug[]> {
  const { earned } = await db.transaction((tx) =>
    recordEarned(
      tx,
      userId,
      reachedTiers(track, metric).map((badge) => ({
        slug: badge.slug,
        celebrate: false,
      })),
    ),
  );
  if (earned.length > 0) clearBadgeRarityCache();
  return earned;
}

/**
 * Records a milestone the caller has just seen happen (its trigger stays
 * at the source); it is always celebrated. Returns whether it was newly
 * earned.
 */
export async function awardMilestone(
  db: BadgeDb,
  userId: string,
  slug: MilestoneSlug,
): Promise<boolean> {
  const outcome = await safely(db, `awarding ${slug} to ${userId}`, (tx) =>
    recordEarned(tx, userId, [{ slug, celebrate: true }]),
  );
  return outcome.earned.length > 0;
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
  const outcome = await safely(
    db,
    `awarding ${slug} to ${userId}`,
    async (tx) => {
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberProfiles);
      if (Number(row?.n ?? 0) > LIMITED_EDITIONS[slug].editionSize) {
        return { earned: [], celebrated: [] };
      }
      return recordEarned(tx, userId, [{ slug, celebrate: true }]);
    },
  );
  return outcome.earned.length > 0;
}
