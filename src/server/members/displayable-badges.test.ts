// @vitest-environment node
import { describe, expect, it } from "vitest";

import { toDisplayableBadges } from "@/server/members/displayable-badges";

describe("displayable badges", () => {
  it("keeps only rows whose slug is in the catalog, as slug and date", () => {
    const earnedAt = new Date("2026-01-01T00:00:00Z");
    const shown = toDisplayableBadges([
      { badgeSlug: "first_event", earnedAt },
      { badgeSlug: "not_in_catalog", earnedAt },
      { badgeSlug: "toString", earnedAt },
      // Removed from the catalog (never awardable): stored, not shown.
      { badgeSlug: "speaker", earnedAt },
    ]);
    expect(shown).toEqual([{ slug: "first_event", earnedAt }]);
  });
});
