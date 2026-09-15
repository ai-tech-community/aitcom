import { describe, expect, it } from "vitest";

import {
  AWESOME_AI_OSS_INSIGHTS_H1,
  AWESOME_AI_OSS_INSIGHTS_META,
  AWESOME_AI_OSS_INSIGHTS_PATH,
  curatedPublicCards,
  type AwesomePublicCard,
} from "./awesome-ai-oss";
import {
  AWESOME_INSIGHTS_CAPTION,
  buildAwesomeInsights,
  formatInsightMonth,
  isAwesomeInsightsTab,
  liveAwesomeStarCards,
} from "./awesome-ai-oss-insights";

function withLiveStars(
  cards: readonly AwesomePublicCard[],
  count: number,
  nowIso = "2026-09-15T12:00:00.000Z",
): AwesomePublicCard[] {
  return cards.slice(0, count).map((card, index) => ({
    ...card,
    starCount: (index + 1) * 50,
    starsCheckedAt: nowIso,
  }));
}

describe("Awesome AI OSS insights paths", () => {
  it("keeps a crawlable /insights path under the investigation", () => {
    expect(AWESOME_AI_OSS_INSIGHTS_PATH).toBe(
      "/investigations/awesome-ai-oss/insights",
    );
    expect(AWESOME_AI_OSS_INSIGHTS_H1).toBe("Awesome AI OSS insights");
    expect(AWESOME_AI_OSS_INSIGHTS_META).toMatch(/from our curated list/i);
    expect(AWESOME_AI_OSS_INSIGHTS_META).toMatch(/not a star-sorted dump/i);
    expect(AWESOME_INSIGHTS_CAPTION).toBe(
      "from our curated list · refreshed daily",
    );
  });

  it("treats ?tab=insights as the Insights alias", () => {
    expect(isAwesomeInsightsTab("insights")).toBe(true);
    expect(isAwesomeInsightsTab(["insights"])).toBe(true);
    expect(isAwesomeInsightsTab("directory")).toBe(false);
    expect(isAwesomeInsightsTab(undefined)).toBe(false);
    expect(isAwesomeInsightsTab("voted")).toBe(false);
  });
});

describe("buildAwesomeInsights", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const cards = curatedPublicCards();

  it("counts category mix and GitHub vs GitLab from the listed cards", () => {
    const stats = buildAwesomeInsights(cards, "en", now);
    expect(stats.total).toBe(cards.length);
    expect(stats.categoryMix.reduce((sum, row) => sum + row.count, 0)).toBe(
      cards.length,
    );
    expect(stats.categoryMix.every((row) => row.count > 0)).toBe(true);
    expect(stats.categoryMix.map((row) => row.id)).toEqual(
      [...stats.categoryMix]
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
        .map((row) => row.id),
    );

    const hosts = Object.fromEntries(
      stats.hostMix.map((row) => [row.host, row.count]),
    );
    expect(hosts.github).toBe(
      cards.filter((card) => card.repoHost === "github").length,
    );
    expect(hosts.gitlab).toBe(
      cards.filter((card) => card.repoHost === "gitlab").length,
    );
    expect(hosts.gitlab).toBe(3);
    expect(stats.hostMix.some((row) => row.count === 0)).toBe(false);
  });

  it("groups added-over-time by listed addedOn months only", () => {
    const stats = buildAwesomeInsights(cards, "en", now);
    expect(stats.addedOverTime.length).toBeGreaterThan(1);
    expect(stats.addedOverTime.reduce((sum, row) => sum + row.count, 0)).toBe(
      cards.length,
    );
    const months = stats.addedOverTime.map((row) => row.month);
    expect(months).toEqual([...months].sort());
    expect(months.every((month) => /^\d{4}-\d{2}$/.test(month))).toBe(true);
    const nov2024 = stats.addedOverTime.find((row) => row.month === "2024-11");
    expect(nov2024?.count).toBe(
      cards.filter((card) => card.addedOn.startsWith("2024-11")).length,
    );
    expect(nov2024?.label).toBe(formatInsightMonth("2024-11", "en"));
  });

  it("never uses Hub votes and omits star charts when no stars were checked", () => {
    const stats = buildAwesomeInsights(cards, "en", now);
    expect(cards.every((card) => card.starCount == null)).toBe(true);
    expect(stats.liveStarCount).toBe(0);
    expect(stats.starDistribution).toBeNull();
    expect(stats.topLiveStars).toBeNull();
    expect(JSON.stringify(stats)).not.toMatch(/vote/i);
  });

  it("ships star charts from any checked live star_count and ignores ★0 / unchecked", () => {
    const live = withLiveStars(cards, 12, now.toISOString());
    const withZeros = [
      ...live,
      {
        ...cards[20]!,
        starCount: 0,
        starsCheckedAt: now.toISOString(),
      },
      {
        ...cards[21]!,
        starCount: 12_400,
        starsCheckedAt: null,
      },
    ];
    const stats = buildAwesomeInsights(withZeros, "en", now);
    expect(stats.liveStarCount).toBe(12);
    expect(stats.starDistribution).not.toBeNull();
    expect(stats.topLiveStars).not.toBeNull();
    expect(stats.topLiveStars).toHaveLength(10);
    expect(stats.topLiveStars?.[0]?.starCount).toBe(600);
    expect(stats.topLiveStars?.every((row) => row.starCount > 0)).toBe(true);
    expect(
      stats.starDistribution?.reduce((sum, row) => sum + row.count, 0),
    ).toBe(12);
    expect(
      stats.starDistribution?.find((row) => row.id === "1-99")?.count,
    ).toBe(1);
    expect(
      stats.starDistribution?.find((row) => row.id === "100-999")?.count,
    ).toBe(11);
    expect(
      liveAwesomeStarCards(withZeros, now).some((card) => card.starCount === 0),
    ).toBe(false);
  });

  it("shows star charts as soon as one fetched positive count exists", () => {
    const partial = [...withLiveStars(cards, 1), ...cards.slice(1)];
    const stats = buildAwesomeInsights(partial, "en", now);
    expect(stats.liveStarCount).toBe(1);
    expect(stats.starDistribution).not.toBeNull();
    expect(stats.topLiveStars).toEqual([
      {
        id: cards[0]!.id,
        name: cards[0]!.name,
        starCount: 50,
        repoHost: cards[0]!.repoHost,
      },
    ]);
  });
});
