import { describe, expect, it } from "vitest";
import { optoutInputError, resolvePrefs } from "./prefs";

describe("resolvePrefs", () => {
  it("defaults to fully opted-in when there are no opt-out rows", () => {
    const p = resolvePrefs([]);
    expect(p.globalDigestOptOut).toBe(false);
    expect(p.digestOptOutCommunityIds.size).toBe(0);
    expect(p.broadcastOptOutCommunityIds.size).toBe(0);
    expect(p.digestOptOutSections.size).toBe(0);
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

  it("treats digest sections as on until a global opt-out row exists", () => {
    const p = resolvePrefs([
      { communityId: null, category: "digest:news" },
      { communityId: null, category: "digest:jobs" },
      { communityId: "c1", category: "digest:events" },
    ]);
    expect([...p.digestOptOutSections].sort()).toEqual(["jobs", "news"]);
    expect(p.globalDigestOptOut).toBe(false);
  });

  it("keeps section choices when the master digest switch is off", () => {
    const p = resolvePrefs([
      { communityId: null, category: "digest" },
      { communityId: null, category: "digest:startups" },
    ]);
    expect(p.globalDigestOptOut).toBe(true);
    expect(p.digestOptOutSections.has("startups")).toBe(true);
  });
});

describe("optoutInputError", () => {
  it("allows the master digest switch and global section rows", () => {
    expect(
      optoutInputError({ communityId: null, category: "digest" }),
    ).toBeNull();
    expect(
      optoutInputError({ communityId: null, category: "digest:community" }),
    ).toBeNull();
    expect(
      optoutInputError({ communityId: "c1", category: "broadcast" }),
    ).toBeNull();
  });

  it("rejects a global broadcast opt-out and a per-community section row", () => {
    expect(
      optoutInputError({ communityId: null, category: "broadcast" }),
    ).toMatch(/broadcast/);
    expect(
      optoutInputError({ communityId: "c1", category: "digest:events" }),
    ).toMatch(/global/);
  });
});
