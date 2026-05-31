import { describe, expect, it } from "vitest";
import { perCommunitySubCap, allowPromotional } from "./ceiling";

describe("perCommunitySubCap", () => {
  it("splits the ceiling evenly, floor, min 1", () => {
    expect(perCommunitySubCap(1, 3)).toBe(3); // single community gets the whole ceiling
    expect(perCommunitySubCap(2, 3)).toBe(1); // floor(3/2)=1
    expect(perCommunitySubCap(4, 3)).toBe(1); // floor(3/4)=0 -> min 1
  });
});

describe("allowPromotional", () => {
  const base = { ceiling: 3, nCommunities: 4, communityId: "c1" };

  it("allows a member with no sends this window", () => {
    expect(allowPromotional({ ...base, sendsByCommunity: {} })).toBe(true);
  });

  it("rejects once the member hit the global ceiling", () => {
    expect(
      allowPromotional({
        ...base,
        sendsByCommunity: { c1: 0, c2: 1, c3: 1, c4: 1 }, // total 3 == ceiling
      }),
    ).toBe(false);
  });

  it("rejects when THIS community already used its sub-cap, even with global room", () => {
    // 4 communities, ceiling 3 -> sub-cap 1. c1 already sent 1; global total only 1.
    expect(allowPromotional({ ...base, sendsByCommunity: { c1: 1 } })).toBe(
      false,
    );
  });

  it("fair-shares: a fast community cannot exceed its slice while others are silent", () => {
    // c1 wants a 2nd send; sub-cap is 1 -> blocked regardless of c2..c4 silence
    expect(
      allowPromotional({ ...base, sendsByCommunity: { c1: 1, c2: 0 } }),
    ).toBe(false);
  });

  it("single-community member may receive up to the full ceiling from that community", () => {
    const solo = { ceiling: 3, nCommunities: 1, communityId: "c1" };
    expect(allowPromotional({ ...solo, sendsByCommunity: { c1: 2 } })).toBe(
      true,
    );
    expect(allowPromotional({ ...solo, sendsByCommunity: { c1: 3 } })).toBe(
      false,
    );
  });
});
