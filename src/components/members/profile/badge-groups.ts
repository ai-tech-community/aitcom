/**
 * Groups a member's badges for the Badges tab (ADR-0039): tracks (each
 * with its tiers), milestones and limited editions. Awards are their own
 * records and are passed through separately.
 *
 * Visitors get earned badges only. The owner also gets every locked tier
 * and milestone, with progress from their own track metrics; a visitor's
 * view never contains a locked entry, whatever the caller passes.
 */
import {
  BADGE_CATALOG,
  BADGE_TRACK_IDS,
  badgesOfTrack,
  type BadgeTrackId,
  type LimitedEditionBadge,
  type MilestoneBadge,
  type TrackBadge,
} from "@/lib/badges/catalog";
import type { TrackProgress } from "@/lib/badges/progress";

export interface HeldBadge {
  slug: string;
  earnedAt: Date | string;
}

export interface TierEntry {
  badge: TrackBadge;
  /** Null: locked (owner only). */
  earnedAt: Date | string | null;
  /** For a locked tier with a known metric: progress towards it. */
  progress: { current: number; threshold: number } | null;
}

export interface TrackGroup {
  track: BadgeTrackId;
  /** The highest earned tier, or (owner, nothing earned) the first locked. */
  lead: TierEntry;
  /** Every tier shown for the track, lowest first. */
  tiers: TierEntry[];
  /** Tiers earned. */
  earned: number;
}

export interface SingleEntry<B> {
  badge: B;
  earnedAt: Date | string | null;
}

export interface BadgeGroups {
  tracks: TrackGroup[];
  milestones: SingleEntry<MilestoneBadge>[];
  limitedEditions: SingleEntry<LimitedEditionBadge>[];
  /** Earned catalog badges shown: the tab's badge count. */
  earnedCount: number;
}

export type BadgeViewer =
  | { kind: "visitor" }
  | { kind: "owner"; progress: readonly TrackProgress[] };

export function groupBadges(
  held: readonly HeldBadge[],
  viewer: BadgeViewer,
): BadgeGroups {
  const earnedAt = new Map(held.map((b) => [b.slug, b.earnedAt]));
  const owner = viewer.kind === "owner";
  const progressOf = new Map(
    owner ? viewer.progress.map((p) => [p.track, p.current]) : [],
  );

  const tracks: TrackGroup[] = [];
  const unstarted: TrackGroup[] = [];
  for (const track of BADGE_TRACK_IDS) {
    const current = progressOf.get(track);
    const all = badgesOfTrack(track).map(
      (badge): TierEntry => ({
        badge,
        earnedAt: earnedAt.get(badge.slug) ?? null,
        progress:
          earnedAt.has(badge.slug) || current === undefined
            ? null
            : { current, threshold: badge.threshold },
      }),
    );
    const tiers = owner ? all : all.filter((tier) => tier.earnedAt !== null);
    const earned = all.filter((tier) => tier.earnedAt !== null);
    const lead = earned.at(-1) ?? (owner ? all[0] : undefined);
    if (!lead) continue;
    (earned.length > 0 ? tracks : unstarted).push({
      track,
      lead,
      tiers,
      earned: earned.length,
    });
  }

  const single = <B extends MilestoneBadge | LimitedEditionBadge>(
    badges: readonly B[],
    showLocked: boolean,
  ): SingleEntry<B>[] => {
    const entries = badges.map((badge) => ({
      badge,
      earnedAt: earnedAt.get(badge.slug) ?? null,
    }));
    const earned = entries.filter((e) => e.earnedAt !== null);
    return showLocked
      ? [...earned, ...entries.filter((e) => e.earnedAt === null)]
      : earned;
  };

  const milestones = single(
    BADGE_CATALOG.filter((b): b is MilestoneBadge => b.kind === "milestone"),
    owner,
  );
  // A limited edition can no longer be earned: never shown locked.
  const limitedEditions = single(
    BADGE_CATALOG.filter(
      (b): b is LimitedEditionBadge => b.kind === "limitedEdition",
    ),
    false,
  );

  return {
    tracks: [...tracks, ...unstarted],
    milestones,
    limitedEditions,
    earnedCount: held.filter((b) =>
      BADGE_CATALOG.some((badge) => badge.slug === b.slug),
    ).length,
  };
}
