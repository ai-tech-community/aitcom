import { describe, expect, it } from "vitest";

import {
  BUILTIN_SURFACES,
  buildDefaultSpaceRows,
  resolveSpaceLabel,
} from "./space-defaults";

describe("BUILTIN_SURFACES", () => {
  it("is the five surfaces in canonical nav order", () => {
    expect(BUILTIN_SURFACES).toEqual([
      "forum",
      "events",
      "classroom",
      "ideas",
      "members",
    ]);
  });
});

describe("buildDefaultSpaceRows", () => {
  it("returns one builtin row per surface, position-ordered, slug=surface", () => {
    const rows = buildDefaultSpaceRows("comm-1");
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.builtinSurface)).toEqual(BUILTIN_SURFACES);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4]);
    for (const r of rows) {
      expect(r.communityId).toBe("comm-1");
      expect(r.kind).toBe("builtin");
      expect(r.slug).toBe(r.builtinSurface);
      expect(r.name).toBeNull();
    }
  });
});

describe("resolveSpaceLabel", () => {
  const t = (key: string) => `T:${key}`;

  it("uses the i18n default for a builtin with no override", () => {
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "forum", name: null },
        t,
      ),
    ).toBe("T:forum");
  });

  it("prefers an explicit name override", () => {
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "forum", name: "Discussions" },
        t,
      ),
    ).toBe("Discussions");
  });
});
