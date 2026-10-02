/**
 * A member's own progress on each badge track (ADR-0039), as the owner's
 * Badges tab shows it on locked tiers ("3 of 5 articles"). Only ever sent
 * to the member themself (`badges.myProgress`).
 */
import {
  badgesOfTrack,
  type BadgeTier,
  type BadgeTrackId,
  type TrackBadgeSlug,
} from "./catalog";

export interface TrackProgress {
  track: BadgeTrackId;
  /** The track's metric now, read by the engine's own metric. */
  current: number;
  /** The lowest tier the metric has not reached yet; null past tier III. */
  next: { tier: BadgeTier; slug: TrackBadgeSlug; threshold: number } | null;
}

/** The progress DTO for one track's metric value. */
export function toTrackProgress(
  track: BadgeTrackId,
  current: number,
): TrackProgress {
  const next = badgesOfTrack(track).find((tier) => current < tier.threshold);
  return {
    track,
    current,
    next: next
      ? { tier: next.tier, slug: next.slug, threshold: next.threshold }
      : null,
  };
}

/** Progress towards one tier, 0–1, for the locked emblem's arc. */
export function tierFraction(current: number, threshold: number): number {
  if (threshold <= 0) return 1;
  return Math.min(1, Math.max(0, current / threshold));
}
