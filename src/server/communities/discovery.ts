/** Pure community-discovery ranking. No DB. Signals are pre-windowed by the caller. */

export type CommunityCandidate = {
  communityId: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number;
  /** Distinct contributors in the current window. */
  activeNow: number;
  /** Contribution-action count in the current window. */
  contributionCount: number;
  /** Contribution-action count in the prior window (for momentum). */
  contributionPrev: number;
  /** community.joined count in the current window. */
  newJoins: number;
};

export type RankedCommunity = CommunityCandidate & { score: number };

/** Liveness score: active contributors dominate, momentum and fresh joins adjust. */
export function livenessScore(c: CommunityCandidate): number {
  return (
    c.activeNow * 3 + (c.contributionCount - c.contributionPrev) + c.newJoins
  );
}

/** Rank discovery candidates for one member, excluding their current communities. */
export function rankCommunitiesForMember(opts: {
  candidates: CommunityCandidate[];
  memberCommunityIds: Set<string>;
  limit?: number;
}): RankedCommunity[] {
  const limit = opts.limit ?? 10;
  const ranked = opts.candidates
    .filter((c) => !opts.memberCommunityIds.has(c.communityId))
    .map((c) => ({ ...c, score: livenessScore(c) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.activeNow - a.activeNow ||
        b.memberCount - a.memberCount ||
        (a.communityId < b.communityId
          ? -1
          : a.communityId > b.communityId
            ? 1
            : 0),
    );
  return ranked.slice(0, limit);
}
