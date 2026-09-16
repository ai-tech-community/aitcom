import { describe, expect, it } from "vitest";

import {
  STARTUPS_INSIGHTS_H1,
  STARTUPS_INSIGHTS_META,
  STARTUPS_INSIGHTS_PATH,
  type StartupPublicCard,
} from "./startups";
import {
  STARTUPS_INSIGHTS_CAPTION,
  STARTUPS_REGION_INSIGHTS_MIN,
  buildStartupInsights,
  isStartupInsightsTab,
  showStartupRegionMix,
} from "./startups-insights";

function card(overrides: Partial<StartupPublicCard> = {}): StartupPublicCard {
  return {
    id: "fixture",
    name: "Fixture Co",
    homepage: "https://fixture.example",
    category: "models",
    sources: ["https://fixture.example/about"],
    region: null,
    lat: null,
    lng: null,
    stage: null,
    logoUrl: null,
    description: null,
    founders: [],
    exitStatus: null,
    acquirer: null,
    exitOn: null,
    jobsUrl: null,
    listedOn: "2026-09-15",
    ...overrides,
  };
}

describe("startup insights paths", () => {
  it("keeps a crawlable /insights path", () => {
    expect(STARTUPS_INSIGHTS_PATH).toBe("/investigations/startups/insights");
    expect(STARTUPS_INSIGHTS_H1).toBe("AI startups insights");
    expect(STARTUPS_INSIGHTS_META).toMatch(/source coverage/i);
    expect(STARTUPS_INSIGHTS_META).toMatch(/from the live directory only/i);
    expect(STARTUPS_INSIGHTS_CAPTION).toBe("from listed companies · Neon only");
    expect(STARTUPS_INSIGHTS_META).not.toMatch(
      /valuation|headcount|attendance|growth rate/i,
    );
  });

  it("treats ?tab=insights as the Insights alias", () => {
    expect(isStartupInsightsTab("insights")).toBe(true);
    expect(isStartupInsightsTab(["insights"])).toBe(true);
    expect(isStartupInsightsTab("directory")).toBe(false);
    expect(isStartupInsightsTab(undefined)).toBe(false);
  });
});

describe("buildStartupInsights", () => {
  it("returns empty aggregates when the directory is empty", () => {
    const stats = buildStartupInsights([], "en");
    expect(stats.total).toBe(0);
    expect(stats.categoryMix).toEqual([]);
    expect(stats.regionMix).toBeNull();
    expect(stats.stageMix).toBeNull();
    expect(stats.sourcesCoverage).toBeNull();
    expect(stats.addedOverTime).toEqual([]);
  });

  it("counts category and listed-on from cards; omits blank regions", () => {
    const stats = buildStartupInsights(
      [
        card({ id: "a", category: "models", listedOn: "2026-09-01" }),
        card({
          id: "b",
          category: "models",
          region: "Toronto, Canada",
          listedOn: "2026-09-02",
        }),
        card({ id: "c", category: "energy", listedOn: "2026-08-10" }),
      ],
      "en",
    );
    expect(stats.total).toBe(3);
    expect(stats.categoryMix.map((row) => [row.id, row.count])).toEqual([
      ["models", 2],
      ["energy", 1],
    ]);
    expect(stats.regionMix).toBeNull();
    expect(stats.stageMix).toBeNull();
    expect(stats.sourcesCoverage).toEqual([
      { sources: 1, label: "1 source", count: 3 },
    ]);
    expect(stats.addedOverTime.map((row) => [row.month, row.count])).toEqual([
      ["2026-08", 1],
      ["2026-09", 2],
    ]);
  });

  it("counts listed stages and source buckets; omits blanks", () => {
    const stats = buildStartupInsights(
      [
        card({ id: "a", stage: "Seed", sources: ["https://a.example/about"] }),
        card({
          id: "b",
          stage: "Seed",
          sources: ["https://b.example/about", "https://b.example/blog"],
        }),
        card({ id: "c", stage: null, sources: [] }),
      ],
      "en",
    );
    expect(stats.stageMix).toEqual([{ stage: "Seed", count: 2 }]);
    expect(stats.sourcesCoverage).toEqual([
      { sources: 1, label: "1 source", count: 1 },
      { sources: 2, label: "2 sources", count: 1 },
    ]);
  });

  it("soft-omits region mix until five distinct sourced regions exist", () => {
    const four = buildStartupInsights(
      [
        card({ id: "a", region: "Toronto, Canada" }),
        card({ id: "b", region: "New York, US" }),
        card({ id: "c", region: "Paris, France" }),
        card({ id: "d", region: "Berlin, Germany" }),
        card({ id: "e", region: null }),
      ],
      "en",
    );
    expect(four.regionMix).toBeNull();

    const five = buildStartupInsights(
      [
        card({ id: "a", region: "Toronto, Canada" }),
        card({ id: "b", region: "New York, US" }),
        card({ id: "c", region: "Paris, France" }),
        card({ id: "d", region: "Berlin, Germany" }),
        card({ id: "e", region: "Tokyo, Japan" }),
      ],
      "en",
    );
    expect(five.regionMix?.map((row) => row.region)).toEqual([
      "Berlin, Germany",
      "New York, US",
      "Paris, France",
      "Tokyo, Japan",
      "Toronto, Canada",
    ]);
    expect(five.regionMix?.every((row) => row.count > 0)).toBe(true);
    expect(STARTUPS_REGION_INSIGHTS_MIN).toBe(5);
    expect(
      showStartupRegionMix([
        { region: "Toronto, Canada", count: 1 },
        { region: "New York, US", count: 1 },
      ]),
    ).toBe(false);
    expect(showStartupRegionMix(four.regionMix)).toBe(false);
    expect(showStartupRegionMix(five.regionMix)).toBe(true);
  });
});
