// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BADGES,
  DISPLAYABLE_BADGE_SLUGS,
  displayableBadge,
} from "@/lib/gamification";
import { toDisplayableBadges } from "@/server/members/displayable-badges";

describe("displayable badges", () => {
  it("are exactly the catalog slugs", () => {
    expect([...DISPLAYABLE_BADGE_SLUGS].sort()).toEqual(
      Object.keys(BADGES).sort(),
    );
  });

  it("looks up catalog entries and rejects other slugs", () => {
    expect(displayableBadge("first_event")?.slug).toBe("first_event");
    expect(displayableBadge("not_in_catalog")).toBeNull();
    expect(displayableBadge("toString")).toBeNull();
  });

  it("keeps only rows whose slug is in the catalog", () => {
    const earnedAt = new Date("2026-01-01T00:00:00Z");
    const shown = toDisplayableBadges([
      { badgeSlug: "first_event", earnedAt },
      { badgeSlug: "not_in_catalog", earnedAt },
    ]);
    expect(shown).toEqual([{ ...BADGES.first_event, earnedAt }]);
  });
});
