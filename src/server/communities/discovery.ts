/** Pure community-discovery ranking. No DB. Signals are pre-windowed by the caller. */

import {
  cardShowsActivity,
  cardShowsMemberCount,
} from "@/server/communities/content-visibility";
import type { JoinPolicy } from "@/server/communities/invite-policy";

export type CommunityCandidate = {
  communityId: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  /** Visibility facts: who may see the signals below (ADR-0050). */
  isListedInDirectory: boolean;
  joinPolicy: JoinPolicy;
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

/**
 * A recommendation as the member it is for may see it. Recommendations
 * leave out the member's own communities, so a private one's member count
 * and activity are never shown (`cardShowsMemberCount`,
 * `cardShowsActivity`); ranking internals stay on the server.
 */
export type CommunityRecommendation = {
  communityId: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  memberCount: number | null;
  activeNow: number | null;
};

export function toCommunityRecommendation(
  c: CommunityCandidate,
): CommunityRecommendation {
  return {
    communityId: c.communityId,
    slug: c.slug,
    name: c.name,
    description: c.description,
    logoUrl: c.logoUrl,
    memberCount: cardShowsMemberCount(c, false) ? c.memberCount : null,
    activeNow: cardShowsActivity(c, false) ? c.activeNow : null,
  };
}
