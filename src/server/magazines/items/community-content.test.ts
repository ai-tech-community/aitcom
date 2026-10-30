import { describe, expect, it, vi } from "vitest";

import { loadCommunityContentRule } from "./community-content";
import type { ItemReader } from "./reader";

function reader() {
  return {
    viewerId: "member",
    hiddenCommunityIds: vi.fn(async () => new Set(["hidden"])),
    membersOnlyCommunityIds: vi.fn(async () => new Set(["private"])),
  } satisfies ItemReader;
}

describe("community content rule", () => {
  it("reads hidden and members-only communities once for an editor", async () => {
    const r = reader();
    const rule = await loadCommunityContentRule(r, "editor");
    rule.readable("private");
    rule.membersOnly("private");
    rule.readable("hidden");
    expect(r.hiddenCommunityIds).toHaveBeenCalledTimes(1);
    expect(r.membersOnlyCommunityIds).toHaveBeenCalledTimes(1);
  });

  it("a reader's rule reads only the hidden set", async () => {
    const r = reader();
    const rule = await loadCommunityContentRule(r, "full");
    expect(rule.readable("private")).toBe(true);
    expect(rule.membersOnly("private")).toBe(false);
    expect(r.hiddenCommunityIds).toHaveBeenCalledTimes(1);
    expect(r.membersOnlyCommunityIds).not.toHaveBeenCalled();
  });

  it("Hub content without a community is readable and not members-only", async () => {
    const rule = await loadCommunityContentRule(reader(), "editor");
    for (const id of [null, undefined]) {
      expect(rule.readable(id)).toBe(true);
      expect(rule.membersOnly(id)).toBe(false);
    }
  });

  it("a hidden community is not readable; a private one is members-only", async () => {
    const rule = await loadCommunityContentRule(reader(), "editor");
    expect(rule.readable("hidden")).toBe(false);
    expect(rule.readable("private")).toBe(true);
    expect(rule.membersOnly("private")).toBe(true);
    expect(rule.membersOnly("public")).toBe(false);
  });
});
