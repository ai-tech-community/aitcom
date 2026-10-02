import { describe, expect, it } from "vitest";

import type { BadgeSlug } from "./catalog";
import {
  SHOWCASE_LIMIT,
  effectivePins,
  featuredBadges,
  highestTiers,
  planPin,
  planUnpin,
  rarestBadges,
  resolveShowcase,
  showcasePinState,
} from "./showcase";

const HOLDERS: Partial<Record<BadgeSlug, number>> = {
  first_event: 90,
  regular: 40,
  veteran: 5,
  article_author: 30,
  prolific_writer: 8,
  profile_complete: 70,
  early_adopter: 5,
  streak_1: 12,
};
const holders = (slug: BadgeSlug) => HOLDERS[slug] ?? 0;

describe("highestTiers", () => {
  it("keeps one badge per track, its highest tier", () => {
    expect(
      highestTiers([
        "first_event",
        "regular",
        "article_author",
        "profile_complete",
      ]),
    ).toEqual(["regular", "article_author", "profile_complete"]);
  });
});

describe("rarestBadges", () => {
  it("ranks by fewest holders, one per track", () => {
    expect(
      rarestBadges(
        [
          "first_event",
          "regular",
          "veteran",
          "article_author",
          "prolific_writer",
          "profile_complete",
        ],
        holders,
      ),
    ).toEqual(["veteran", "prolific_writer", "profile_complete"]);
  });

  it("breaks a tie in holders towards the harder badge", () => {
    // veteran (tier III) and early_adopter both have 5 holders.
    expect(rarestBadges(["veteran", "early_adopter"], holders)).toEqual([
      "early_adopter",
      "veteran",
    ]);
  });
});

describe("effectivePins", () => {
  it("drops pins the member does not hold and raises a track to its top tier", () => {
    expect(
      effectivePins(
        ["first_event", "speaker", "streak_1", "article_author"],
        ["first_event", "regular", "article_author"],
      ),
    ).toEqual(["regular", "article_author"]);
  });

  it("shows two pinned tiers of one track once", () => {
    expect(
      effectivePins(["first_event", "regular"], ["first_event", "regular"]),
    ).toEqual(["regular"]);
  });
});

describe("resolveShowcase", () => {
  it("uses the pins when any still apply", () => {
    expect(
      resolveShowcase(
        ["profile_complete"],
        ["profile_complete", "veteran"],
        holders,
      ),
    ).toEqual({ slugs: ["profile_complete"], source: "pinned" });
  });

  it("falls back to the three rarest when nothing (valid) is pinned", () => {
    expect(
      resolveShowcase(
        ["streak_1"],
        ["regular", "article_author", "profile_complete", "early_adopter"],
        holders,
      ),
    ).toEqual({
      slugs: ["early_adopter", "article_author", "regular"],
      source: "rarest",
    });
  });

  it("is empty for a member without badges", () => {
    expect(resolveShowcase([], [], holders)).toEqual({
      slugs: [],
      source: "rarest",
    });
  });
});

describe("planPin", () => {
  const held: BadgeSlug[] = [
    "first_event",
    "regular",
    "article_author",
    "profile_complete",
    "early_adopter",
  ];

  it("appends a held badge", () => {
    expect(planPin(["article_author"], "profile_complete", held)).toEqual({
      ok: true,
      next: ["article_author", "profile_complete"],
    });
  });

  it("refuses a badge the member does not hold, or one outside the catalog", () => {
    expect(planPin([], "veteran", held)).toEqual({
      ok: false,
      reason: "not_held",
    });
    expect(planPin([], "speaker", [...held, "speaker" as BadgeSlug])).toEqual({
      ok: false,
      reason: "not_held",
    });
  });

  it(`refuses a ${SHOWCASE_LIMIT + 1}th pin`, () => {
    expect(
      planPin(
        ["regular", "article_author", "profile_complete"],
        "early_adopter",
        held,
      ),
    ).toEqual({ ok: false, reason: "full" });
  });

  it("drops stale pins before counting", () => {
    expect(
      planPin(
        ["veteran", "article_author", "profile_complete"],
        "early_adopter",
        held,
      ),
    ).toEqual({
      ok: true,
      next: ["article_author", "profile_complete", "early_adopter"],
    });
  });

  it("replaces another tier of the same track in place, even when full", () => {
    expect(
      planPin(
        ["first_event", "article_author", "profile_complete"],
        "regular",
        held,
      ),
    ).toEqual({
      ok: true,
      next: ["regular", "article_author", "profile_complete"],
    });
  });
});

describe("planUnpin", () => {
  it("removes the badge and any tier of its track", () => {
    expect(planUnpin(["first_event", "profile_complete"], "regular")).toEqual([
      "profile_complete",
    ]);
  });

  it("removes a pin that is no longer in the catalog", () => {
    expect(planUnpin(["speaker", "regular"], "speaker")).toEqual(["regular"]);
  });
});

describe("without rarity (it failed to load)", () => {
  // Held newest first, as the profile and roster queries return them.
  const newestFirst: BadgeSlug[] = [
    "article_author",
    "regular",
    "profile_complete",
    "first_event",
    "early_adopter",
  ];

  it("features the most recent badges, one per track", () => {
    expect(featuredBadges(newestFirst, null)).toEqual([
      "article_author",
      "regular",
      "profile_complete",
    ]);
  });

  it("falls back to the most recent in the showcase, and says so", () => {
    expect(resolveShowcase([], newestFirst, null)).toEqual({
      slugs: ["article_author", "regular", "profile_complete"],
      source: "recent",
    });
  });

  it("still shows the pins", () => {
    expect(resolveShowcase(["early_adopter"], newestFirst, null)).toEqual({
      slugs: ["early_adopter"],
      source: "pinned",
    });
  });
});

describe("showcasePinState", () => {
  it("is pinned when the badge's track is pinned at any tier", () => {
    expect(showcasePinState(["first_event"], "veteran")).toBe("pinned");
    expect(showcasePinState(["early_adopter"], "early_adopter")).toBe("pinned");
  });

  it("is open below the limit and full at it", () => {
    expect(showcasePinState([], "article_author")).toBe("open");
    expect(
      showcasePinState(["first_event", "early_adopter"], "article_author"),
    ).toBe("open");
    const full: BadgeSlug[] = [
      "first_event",
      "early_adopter",
      "course_complete",
    ];
    expect(full).toHaveLength(SHOWCASE_LIMIT);
    expect(showcasePinState(full, "article_author")).toBe("full");
    expect(showcasePinState(full, "learner_2")).toBe("pinned");
  });
});
