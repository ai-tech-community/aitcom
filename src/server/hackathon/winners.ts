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
