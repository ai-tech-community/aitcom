import { describe, expect, it } from "vitest";

import { AI_TOOLS_LIST_PATH } from "@/lib/investigations/ai-tools-list";
import { HUB_FORUM_PATH } from "@/server/communities/forum-scope";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";
import { JOIN_HREF, NAV_BAR, keyboardNavItems } from "./site-nav";

describe("site nav", () => {
  it("keeps the guest door on /join so next-intl can prefix the locale", () => {
    // Locale-aware Link / router.push turn this into /en/join and /nl/join.
    expect(JOIN_HREF).toBe("/join");
    expect(JOIN_HREF.startsWith("/en")).toBe(false);
  });

  it("keeps the letter shortcuts unique and off the account keys", () => {
    const shortcuts = keyboardNavItems().map((item) => item.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    expect(shortcuts).toEqual(
      expect.arrayContaining([
        "C",
        "E",
        "R",
        "W",
        "U",
        "N",
        "L",
        "T",
        "F",
        "M",
        "B",
        "G",
        "I",
        "S",
        "O",
        "K",
      ]),
    );
    expect(shortcuts).not.toContain("D");
    expect(shortcuts).not.toContain("A");
    expect(shortcuts).not.toContain("J");
  });

  it("keeps Forum and Ideas under Community, and AI tools under Startups", () => {
    const community = NAV_BAR.find((entry) => entry.key === "community");
    const startups = NAV_BAR.find((entry) => entry.key === "startups");
    expect(community?.type).toBe("group");
    expect(startups?.type).toBe("group");
    if (community?.type !== "group" || startups?.type !== "group") return;
    expect(community.items.map((item) => item.key)).toEqual([
      "explore",
      "members",
      "agents",
      "forum",
      "ideas",
    ]);
    expect(community.items.find((item) => item.key === "forum")?.href).toBe(
      HUB_FORUM_PATH,
    );
    expect(startups.items.map((item) => item.key)).toEqual([
      "startups",
      "aiTools",
      "launchpad",
    ]);
    expect(startups.items.find((item) => item.key === "aiTools")?.href).toBe(
      AI_TOOLS_LIST_PATH,
    );
    expect(AI_TOOLS_LIST_PATH).toBe("/startups/ai-tools-list");
    expect(startups.items.map((item) => item.href)).not.toContain("/ideas");
  });

  it("has a one-line description in English and Dutch for every grouped item", () => {
    for (const entry of NAV_BAR) {
      if (entry.type !== "group") continue;
      expect(en.nav.groups[entry.key]).toBeTruthy();
      expect(nl.nav.groups[entry.key]).toBeTruthy();
      for (const item of entry.items) {
        expect(en.nav.descriptions[item.key].length).toBeGreaterThan(0);
        expect(en.nav.descriptions[item.key].length).toBeLessThan(48);
        expect(nl.nav.descriptions[item.key].length).toBeGreaterThan(0);
        expect(nl.nav.descriptions[item.key]).not.toBe(
          en.nav.descriptions[item.key],
        );
      }
    }
  });
});
