// Pure presentation split for the public winners page: the podium (final ranks
// 1..podiumSize, set at finalize time) versus the rest of the field. Sorting is
// recomputed here so the split is deterministic regardless of input order:
// ranked teams by finalRank, unranked teams (never submitted) after them by
// score. Db-free so it can be unit-tested in isolation.

const PODIUM_SIZE = 3;

export interface PodiumSplittable {
  finalRank: number | null;
  score: number;
}

export function splitPodium<T extends PodiumSplittable>(
  rows: T[],
  podiumSize: number = PODIUM_SIZE,
): { podium: T[]; field: T[] } {
  const byStanding = (a: T, b: T) => {
    if (a.finalRank !== null && b.finalRank !== null) {
      return a.finalRank - b.finalRank;
    }
    if (a.finalRank !== null) return -1;
    if (b.finalRank !== null) return 1;
    return b.score - a.score;
  };
  const sorted = [...rows].sort(byStanding);
  return {
    podium: sorted.filter(
      (t) => t.finalRank !== null && t.finalRank <= podiumSize,
    ),
    field: sorted.filter(
      (t) => t.finalRank === null || t.finalRank > podiumSize,
    ),
  };
}

export interface PrizeAttributable {
  finalRank: number | null;
  prizeAwarded: boolean;
}

/**
 * Which team(s) to publicly attribute the prize to. The disbursement marker
 * (prizeAwardedAt → prizeAwarded) is the truth: finalize re-runs recompute
 * finalRank but never pay a second team, so after a re-finalize the current
 * rank-1 team may not be the team that actually received the prize. Legacy
 * rows finalized before the marker existed fall back to current rank 1 so the
 * prize attribution doesn't silently disappear.
 */
export function prizeRecipients<T extends PrizeAttributable>(rows: T[]): T[] {
  const awarded = rows.filter((t) => t.prizeAwarded);
  if (awarded.length > 0) return awarded;
  return rows.filter((t) => t.finalRank === 1);
}
