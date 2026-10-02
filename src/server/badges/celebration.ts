import {
  reachedTiers,
  type BadgeSlug,
  type BadgeTrackId,
} from "@/lib/badges/catalog";

/** A badge to record, and whether the triggering action reached it. */
export interface Earning {
  slug: BadgeSlug;
  celebrate: boolean;
}

/**
 * The celebration rule (ADR-0039): a tier is celebrated (XP bonus,
 * notification, earned event) only when the action that triggered the
 * evaluation is what reached it, i.e. the metric now equals the tier's
 * threshold. Tiers already passed (threshold below the metric) are
 * recorded silently, exactly as the backfill records them, so the outcome
 * does not depend on whether the backfill ran first.
 */
export function trackEarnings(track: BadgeTrackId, metric: number): Earning[] {
  return reachedTiers(track, metric).map((badge) => ({
    slug: badge.slug,
    celebrate: metric === badge.threshold,
  }));
}
