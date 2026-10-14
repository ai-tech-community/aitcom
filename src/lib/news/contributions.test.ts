import { describe, expect, it } from "vitest";

import {
  applyStoryClaim,
  BREAKING_BONUS,
  CLAIM_POINTS,
  contributionStreak,
  contributionWeekStart,
  isBreakingTopic,
  publishedContributionBadges,
  storyRegion,
  topicsCoveredToday,
} from "./contributions";

const NOW = new Date("2026-10-14T12:00:00.000Z");

describe("storyRegion", () => {
  it("uses a region only when the headlines name it", () => {
    expect(storyRegion(["EU AI Act enforcement begins"])).toBe("eu");
    expect(storyRegion(["Israeli labs open a new chip line"])).toBe("il");
    expect(storyRegion(["Japan ships a new model"])).toBe("asia");
    expect(storyRegion(["A model runs on a laptop"])).toBeNull();
  });

  it("does not pick a region when two places are named equally", () => {
    expect(
      storyRegion(["European and Japanese labs publish the same result"]),
    ).toBeNull();
  });
});

describe("claims, coverage, and streaks", () => {
  it("treats a headline from the last 24 hours as breaking", () => {
    expect(isBreakingTopic(new Date("2026-10-14T00:00:00.000Z"), NOW)).toBe(
      true,
    );
    expect(isBreakingTopic(new Date("2026-10-12T00:00:00.000Z"), NOW)).toBe(
      false,
    );
  });

  it("starts the week on Monday UTC, like the digest", () => {
    expect(contributionWeekStart(NOW).toISOString()).toBe(
      "2026-10-12T00:00:00.000Z",
    );
  });

  it("counts suggested topics claimed today and hides the bar when there are none", () => {
    expect(topicsCoveredToday(["a", "b"], ["b", "c", "b"])).toEqual({
      covered: 1,
      total: 5,
      visible: true,
    });
    expect(topicsCoveredToday([], ["a"])).toEqual({
      covered: 0,
      total: 5,
      visible: false,
    });
  });

  it("counts a streak through today and keeps the longest run", () => {
    expect(
      contributionStreak(
        ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-01", "2026-10-02"],
        "2026-10-14",
      ),
    ).toEqual({ current: 3, longest: 3 });
    expect(contributionStreak(["2026-10-12"], "2026-10-14")).toEqual({
      current: 0,
      longest: 1,
    });
    expect(contributionStreak([], "2026-10-14")).toEqual({
      current: 0,
      longest: 0,
    });
  });
});

describe("applyStoryClaim", () => {
  it("awards 10 points, plus 25 for the first claim on a breaking topic", async () => {
    const writes: string[] = [];
    const store = {
      insertClaim: async () => {
        writes.push("claim");
        return "inserted" as const;
      },
      insertBreaking: async () => {
        writes.push("breaking");
        return "inserted" as const;
      },
      existingClaim: async () => null,
    };
    const claimed = await applyStoryClaim(store, {
      userId: "member",
      topicKey: "eu-ai-act",
      title: "EU AI Act",
      now: NOW,
      breaking: true,
    });
    expect(claimed).toMatchObject({
      alreadyClaimed: false,
      pointsAwarded: CLAIM_POINTS + BREAKING_BONUS,
      firstScoop: true,
    });
    expect(writes).toEqual(["claim", "breaking"]);
  });

  it("does not pay twice and does not grant the bonus when someone else was first", async () => {
    const repeat = await applyStoryClaim(
      {
        insertClaim: async () => "exists",
        insertBreaking: async () => "inserted",
        existingClaim: async () => ({
          expiresAt: new Date("2026-10-15T12:00:00.000Z"),
        }),
      },
      {
        userId: "member",
        topicKey: "eu-ai-act",
        title: "EU AI Act",
        now: NOW,
        breaking: true,
      },
    );
    expect(repeat).toMatchObject({
      alreadyClaimed: true,
      pointsAwarded: 0,
      firstScoop: false,
    });

    const second = await applyStoryClaim(
      {
        insertClaim: async () => "inserted",
        insertBreaking: async () => "exists",
        existingClaim: async () => null,
      },
      {
        userId: "other",
        topicKey: "eu-ai-act",
        title: "EU AI Act",
        now: NOW,
        breaking: true,
      },
    );
    expect(second.pointsAwarded).toBe(CLAIM_POINTS);
    expect(second.firstScoop).toBe(false);
  });
});

describe("publishedContributionBadges", () => {
  it("awards five stories and a region only from the stored counts", () => {
    expect(
      publishedContributionBadges({
        publishedCount: 5,
        region: "eu",
        regionCount: 3,
      }),
    ).toEqual(["news_five_stories", "news_region_eu"]);
    expect(
      publishedContributionBadges({
        publishedCount: 4,
        region: null,
        regionCount: 0,
      }),
    ).toEqual([]);
  });
});
