import { describe, expect, it } from "vitest";
import { resolvePrefs } from "./prefs";

describe("resolvePrefs", () => {
  it("defaults to fully opted-in when there are no opt-out rows", () => {
    const p = resolvePrefs([]);
    expect(p.globalDigestOptOut).toBe(false);
    expect(p.digestOptOutCommunityIds.size).toBe(0);
    expect(p.broadcastOptOutCommunityIds.size).toBe(0);
  });

  it("reads a global digest opt-out (communityId null)", () => {
    const p = resolvePrefs([{ communityId: null, category: "digest" }]);
    expect(p.globalDigestOptOut).toBe(true);
  });

  it("reads per-community digest and broadcast opt-outs", () => {
    const p = resolvePrefs([
      { communityId: "c1", category: "digest" },
      { communityId: "c2", category: "broadcast" },
    ]);
    expect(p.digestOptOutCommunityIds.has("c1")).toBe(true);
    expect(p.broadcastOptOutCommunityIds.has("c2")).toBe(true);
    expect(p.digestOptOutCommunityIds.has("c2")).toBe(false);
  });
});
