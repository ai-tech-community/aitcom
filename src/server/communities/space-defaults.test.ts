import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import nl from "../../../messages/nl.json";
import {
  BUILTIN_SURFACES,
  OPTIONAL_BUILTIN_SURFACES,
  buildDefaultSpaceRows,
  isDefaultBuiltinLabel,
  resolveSpaceLabel,
  type BuiltinSurface,
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

describe("OPTIONAL_BUILTIN_SURFACES", () => {
  it("magazine is an optional surface, not one of the five defaults", () => {
    expect(buildDefaultSpaceRows("c").map((r) => r.slug)).toEqual([
      "forum",
      "events",
      "classroom",
      "ideas",
      "members",
    ]);
    expect(OPTIONAL_BUILTIN_SURFACES).toContain("magazine");
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

  it("treats every locale's catalogue label as the default name", () => {
    const surfaces = [
      ...BUILTIN_SURFACES,
      ...OPTIONAL_BUILTIN_SURFACES,
    ] as const satisfies readonly BuiltinSurface[];
    for (const messages of [en, nl, fr]) {
      for (const surface of surfaces) {
        expect(
          isDefaultBuiltinLabel(surface, messages.communities.profile[surface]),
          `${surface}`,
        ).toBe(true);
      }
    }
    expect(isDefaultBuiltinLabel("events", "Gatherings")).toBe(false);
  });

  it("localizes a stored default name for a builtin surface", () => {
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "events", name: "Events" },
        t,
      ),
    ).toBe("T:events");
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "events", name: "Événements" },
        t,
      ),
    ).toBe("T:events");
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "classroom", name: "Classrooms" },
        t,
      ),
    ).toBe("T:classroom");
  });
});
