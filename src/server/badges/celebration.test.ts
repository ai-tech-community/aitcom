// @vitest-environment node
import { describe, expect, it } from "vitest";

import { trackEarnings } from "@/server/badges/celebration";

describe("trackEarnings (the celebration rule)", () => {
  it("celebrates only the tier whose threshold the metric now equals", () => {
    expect(trackEarnings("regular", 10)).toEqual([
      { slug: "first_event", celebrate: false },
      { slug: "regular", celebrate: false },
      { slug: "veteran", celebrate: true },
    ]);
    expect(trackEarnings("regular", 3)).toEqual([
      { slug: "first_event", celebrate: false },
      { slug: "regular", celebrate: true },
    ]);
  });

  it("records passed tiers silently when no threshold is hit exactly", () => {
    expect(trackEarnings("streak", 40)).toEqual([
      { slug: "streak_1", celebrate: false },
      { slug: "streak_2", celebrate: false },
    ]);
    expect(trackEarnings("teacher", 0)).toEqual([]);
  });
});
