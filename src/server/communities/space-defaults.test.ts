import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import nl from "../../../messages/nl.json";
import {
  BUILTIN_SURFACES,
  HIDDEN_DEFAULT_SURFACES,
  OPTIONAL_BUILTIN_SURFACES,
  buildDefaultSpaceRows,
  isDefaultBuiltinLabel,
  resolveSpaceLabel,
  type BuiltinSurface,
} from "./space-defaults";

describe("BUILTIN_SURFACES", () => {
  it("is the six surfaces in canonical nav order, gallery after events", () => {
    expect(BUILTIN_SURFACES).toEqual([
      "forum",
      "events",
      "gallery",
      "classroom",
      "ideas",
      "members",
    ]);
  });
});

describe("buildDefaultSpaceRows", () => {
  it("seeds Offers first and hidden, then the six shown surfaces", () => {
    const now = new Date("2026-11-14T00:00:00Z");
    const rows = buildDefaultSpaceRows("comm-1", now);
    expect(rows.map((r) => r.slug)).toEqual([
      "offers",
      "forum",
      "events",
      "gallery",
      "classroom",
      "ideas",
      "members",
    ]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rows[0]).toMatchObject({
      builtinSurface: "offers",
      archivedAt: now,
    });
    expect(rows.slice(1).every((r) => r.archivedAt === null)).toBe(true);
    for (const r of rows) {
      expect(r.communityId).toBe("comm-1");
      expect(r.kind).toBe("builtin");
      expect(r.slug).toBe(r.builtinSurface);
      expect(r.name).toBeNull();
    }
  });

  it("seeds the gallery row after events", () => {
    const rows = buildDefaultSpaceRows("comm-1");
    const slugs = rows.map((r) => r.slug);
    expect(slugs.indexOf("gallery")).toBe(slugs.indexOf("events") + 1);
  });
});

describe("OPTIONAL_BUILTIN_SURFACES", () => {
  it("magazine is an optional surface, never seeded", () => {
    expect(buildDefaultSpaceRows("c").map((r) => r.slug)).not.toContain(
      "magazine",
    );
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
      ...HIDDEN_DEFAULT_SURFACES,
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
    expect(isDefaultBuiltinLabel("gallery", "Galerij")).toBe(true);
    expect(isDefaultBuiltinLabel("gallery", "Galerie")).toBe(true);
    expect(isDefaultBuiltinLabel("gallery", "Photos")).toBe(false);
  });

  it("treats old and new Members labels as the default name", () => {
    for (const label of [
      "Members",
      "Leden",
      "Membres",
      "People",
      "Mensen",
      "Personnes",
    ]) {
      expect(isDefaultBuiltinLabel("members", label), label).toBe(true);
    }
    expect(isDefaultBuiltinLabel("members", "Crew")).toBe(false);
  });

  it("labels the members surface People in every language", () => {
    expect(en.communities.profile.members).toBe("People");
    expect(nl.communities.profile.members).toBe("Mensen");
    expect(fr.communities.profile.members).toBe("Personnes");
    expect(en.communityMatching.navigation).toBe("People");
    expect(nl.communityMatching.navigation).toBe("Mensen");
    expect(fr.communityMatching.navigation).toBe("Personnes");
  });

  it("keeps an owner's own name for the members tab", () => {
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "members", name: "Crew" },
        t,
      ),
    ).toBe("Crew");
    expect(
      resolveSpaceLabel(
        { kind: "builtin", builtinSurface: "members", name: "Members" },
        t,
      ),
    ).toBe("T:members");
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
