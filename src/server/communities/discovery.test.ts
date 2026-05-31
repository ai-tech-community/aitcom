import { describe, it, expect } from "vitest";
import {
  livenessScore,
  rankCommunitiesForMember,
  type CommunityCandidate,
} from "./discovery";

function candidate(
  over: Partial<CommunityCandidate> & { communityId: string },
): CommunityCandidate {
  return {
    communityId: over.communityId,
    slug: over.slug ?? over.communityId,
    name: over.name ?? over.communityId,
    description: over.description ?? null,
    logoUrl: over.logoUrl ?? null,
    memberCount: over.memberCount ?? 0,
    activeNow: over.activeNow ?? 0,
    contributionCount: over.contributionCount ?? 0,
    contributionPrev: over.contributionPrev ?? 0,
    newJoins: over.newJoins ?? 0,
  };
}

describe("livenessScore", () => {
  it("weights active contributors, positive momentum, and new joins", () => {
    expect(
      livenessScore(
        candidate({
          communityId: "a",
          activeNow: 5,
          contributionCount: 20,
          contributionPrev: 8,
          newJoins: 2,
        }),
      ),
    ).toBe(5 * 3 + (20 - 8) + 2); // 29
  });

  it("lets declining momentum lower the score (negative delta counts)", () => {
    expect(
      livenessScore(
        candidate({
          communityId: "b",
          activeNow: 2,
          contributionCount: 3,
          contributionPrev: 10,
          newJoins: 0,
        }),
      ),
    ).toBe(2 * 3 + (3 - 10)); // -1
  });
});

describe("rankCommunitiesForMember", () => {
  it("excludes communities the member already belongs to", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "a", activeNow: 10 }),
        candidate({ communityId: "b", activeNow: 1 }),
      ],
      memberCommunityIds: new Set(["a"]),
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["b"]);
  });

  it("sorts by score descending", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "low", activeNow: 1 }),
        candidate({ communityId: "high", activeNow: 10 }),
        candidate({ communityId: "mid", activeNow: 5 }),
      ],
      memberCommunityIds: new Set(),
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["high", "mid", "low"]);
  });

  it("breaks ties by activeNow, then memberCount, then communityId", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "z", activeNow: 0, memberCount: 0 }),
        candidate({ communityId: "a", activeNow: 0, memberCount: 0 }),
        candidate({ communityId: "m", activeNow: 0, memberCount: 50 }),
      ],
      memberCommunityIds: new Set(),
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["m", "a", "z"]);
  });

  it("applies the limit", () => {
    const ranked = rankCommunitiesForMember({
      candidates: [
        candidate({ communityId: "a", activeNow: 3 }),
        candidate({ communityId: "b", activeNow: 2 }),
        candidate({ communityId: "c", activeNow: 1 }),
      ],
      memberCommunityIds: new Set(),
      limit: 2,
    });
    expect(ranked.map((r) => r.communityId)).toEqual(["a", "b"]);
  });

  it("returns [] for empty candidates", () => {
    expect(
      rankCommunitiesForMember({
        candidates: [],
        memberCommunityIds: new Set(),
      }),
    ).toEqual([]);
  });

  it("attaches the computed score", () => {
    const [r] = rankCommunitiesForMember({
      candidates: [candidate({ communityId: "a", activeNow: 4 })],
      memberCommunityIds: new Set(),
    });
    expect(r.score).toBe(12);
  });
});
