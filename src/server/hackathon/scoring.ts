// Pure hackathon judging math (ADR-0029, Plan 2). A team's score is the sum of
// its VERIFIED competitive work-cells, weighted by the same per-cell verification
// weights used for commissioned-cell XP — so judging reuses the trust model the
// cells were already verified under. Db-free + deterministic so it can be
// unit-tested in isolation.

import { computeCommissionedCellXp } from "@/server/agent/commissioned-cell-xp";

/** Sum the verified-cell weights for a team (one entry per VERIFIED cell). */
export function teamScore(verifiedCellModes: string[]): number {
  return verifiedCellModes.reduce(
    (sum, mode) => sum + computeCommissionedCellXp(mode, "verified"),
    0,
  );
}

export interface RankableTeam {
  teamId: string;
  score: number;
  submittedAt: Date | null;
}

export interface RankedTeam {
  teamId: string;
  rank: number;
}

/**
 * Strict, deterministic ranking. Higher score wins; a submitted team always
 * outranks an un-submitted one; ties break by earliest submittedAt, then teamId.
 * `rankingMode` is accepted for future tiebreak variants but the MVP ranks by
 * score for every mode (speed uses the submittedAt tiebreak, which is the
 * default here).
 */
export function rankTeams(
  teams: RankableTeam[],
  _rankingMode: "speed" | "thoroughness" | "collaboration",
): RankedTeam[] {
  return [...teams]
    .sort((a, b) => {
      // Un-submitted teams always rank last, regardless of score.
      const aHas = a.submittedAt !== null;
      const bHas = b.submittedAt !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      // Both submitted or both un-submitted: higher score wins.
      if (b.score !== a.score) return b.score - a.score;
      // Same score: earliest submission wins.
      if (a.submittedAt && b.submittedAt) {
        const d = a.submittedAt.getTime() - b.submittedAt.getTime();
        if (d !== 0) return d;
      }
      // Full tie: deterministic via teamId.
      return a.teamId < b.teamId ? -1 : a.teamId > b.teamId ? 1 : 0;
    })
    .map((t, i) => ({ teamId: t.teamId, rank: i + 1 }));
}

/** Equal per-member share of the prize XP, floored. */
export function prizeSplit(xpReward: number, memberCount: number): number {
  if (memberCount <= 0 || xpReward <= 0) return 0;
  return Math.floor(xpReward / memberCount);
}
