import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import {
  STARTUPS_INSIGHTS_H1,
  STARTUPS_INSIGHTS_META,
  STARTUPS_INSIGHTS_PATH,
  type StartupLocale,
  type StartupPublicCard,
} from "./startups";
import {
  STARTUPS_INSIGHTS_COUNTRIES_MIN,
  STARTUPS_INSIGHTS_TIMELINE_MIN_MONTHS,
  STARTUPS_INSIGHTS_TOP_COUNTRIES,
  STARTUPS_INSIGHTS_TOP_HIRING,
  buildStartupInsights,
  isStartupInsightsTab,
  startupInsightsOgSpec,
  startupInsightsShareFacts,
  type StartupsInsightsStats,
} from "./startups-insights";
import type { StartupCountryCode } from "./startups-countries";

function insightsT(locale: StartupLocale) {
  const translator = createTranslator({
    locale,
    messages: locale === "nl" ? nl : en,
    namespace: "investigationsStartups",
  });
  return (key: string, values?: Record<string, string | number>) =>
    translator(key as "shareOgKicker", values);
}

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
    country: null,
    stage: null,
    logoUrl: null,
    description: null,
    founders: [],
    exitStatus: null,
    acquirer: null,
    exitOn: null,
    jobsUrl: null,
    listedOn: "2026-09-15",
    slug: "fixture-co",
    openRoleCount: 0,
    ...overrides,
  };
}

describe("startup insights paths", () => {
  it("keeps a crawlable /insights path", () => {
    expect(STARTUPS_INSIGHTS_PATH).toBe("/startups/insights");
    expect(STARTUPS_INSIGHTS_H1).toBe("AI startups insights");
    expect(STARTUPS_INSIGHTS_META).toMatch(/who is hiring/i);
    expect(STARTUPS_INSIGHTS_META).toMatch(/from the live directory only/i);
    expect(STARTUPS_INSIGHTS_META).not.toMatch(
      /valuation|headcount|attendance|growth rate|largest/i,
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
  it("returns empty counts without inventing rows", () => {
    const stats = buildStartupInsights([], "en");
    expect(stats.total).toBe(0);
    expect(stats.countryCount).toBe(0);
    expect(stats.countries).toBeNull();
    expect(stats.categories).toEqual([]);
    expect(stats.hiring.companies).toBe(0);
    expect(stats.hiring.roles).toBe(0);
    expect(stats.hiring.rolesCapped).toBe(false);
    expect(stats.hiring.top).toEqual([]);
    expect(stats.hiring.bands.every((band) => band.count === 0)).toBe(true);
    expect(stats.timeline).toBeNull();
    expect(stats.stageMix).toBeNull();
  });

  it("groups stored countries and folds the tail", () => {
    const tail = ["BE", "BR", "CA", "CH", "ES", "IN", "IT", "JP", "KR", "NL"];
    const countries: Array<StartupCountryCode | null> = [
      "IL",
      "IL",
      "IL",
      "US",
      "US",
      "GB",
      "DE",
      "FR",
      ...(tail as StartupCountryCode[]),
      null,
      null,
    ];
    const stats = buildStartupInsights(
      countries.map((country, i) => card({ id: `c${i}`, country })),
      "en",
    );
    expect(stats.countryCount).toBe(15);
    expect(stats.countries?.rows).toHaveLength(STARTUPS_INSIGHTS_TOP_COUNTRIES);
    expect(stats.countries?.rows.slice(0, 2)).toEqual([
      { code: "IL", label: "Israel", count: 3 },
      { code: "US", label: "United States", count: 2 },
    ]);
    expect(stats.countries?.other).toEqual({ companies: 5, countries: 5 });
    expect(stats.countries?.unplaced).toBe(2);
  });

  it("never reads a country out of the place text", () => {
    const stats = buildStartupInsights(
      ["Berlin", "Munich", "Hamburg", "Israel", "Paris, France"].map(
        (region, i) => card({ id: `r${i}`, region, country: null }),
      ),
      "en",
    );
    expect(stats.countryCount).toBe(0);
  });

  it("names countries in the page language", () => {
    const stats = buildStartupInsights(
      (["US", "DE", "NL", "IL", "FR"] as const).map((country, i) =>
        card({ id: `n${i}`, country }),
      ),
      "nl",
    );
    expect(stats.countries?.rows.map((row) => row.label)).toEqual([
      "Duitsland",
      "Frankrijk",
      "Israël",
      "Nederland",
      "Verenigde Staten",
    ]);
  });

  it("omits the country section until five countries are listed", () => {
    const four = buildStartupInsights(
      (["IL", "US", "FR", "DE"] as const).map((country, i) =>
        card({ id: `f${i}`, country }),
      ),
      "en",
    );
    expect(STARTUPS_INSIGHTS_COUNTRIES_MIN).toBe(5);
    expect(four.countries).toBeNull();
    expect(four.countryCount).toBe(4);
  });

  it("counts hiring per category and flags capped role counts", () => {
    const stats = buildStartupInsights(
      [
        card({ id: "a", name: "Alpha", category: "agents", openRoleCount: 40 }),
        card({ id: "b", name: "Beta", category: "agents", openRoleCount: 5 }),
        card({ id: "c", name: "Gamma", category: "agents" }),
        card({ id: "d", name: "Delta", category: "robotics" }),
      ],
      "en",
    );
    expect(stats.categories).toEqual([
      { id: "agents", label: "Agents", count: 3, hiring: 2 },
      { id: "robotics", label: "Robotics", count: 1, hiring: 0 },
    ]);
    expect(stats.hiring.companies).toBe(2);
    expect(stats.hiring.roles).toBe(45);
    expect(stats.hiring.rolesCapped).toBe(true);
    // A cap tie cannot be ranked, so only the capped companies are named.
    expect(
      stats.hiring.top.map((row) => [row.name, row.roles, row.capped]),
    ).toEqual([["Alpha", 40, true]]);
    expect(
      stats.hiring.bands.map((band) => [band.min, band.max, band.count]),
    ).toEqual([
      [1, 4, 0],
      [5, 9, 1],
      [10, 19, 0],
      [20, 39, 0],
      [40, null, 1],
    ]);
  });

  it("names the top companies by count when none reach the cap", () => {
    const stats = buildStartupInsights(
      [
        card({ id: "a", name: "Alpha", openRoleCount: 3 }),
        card({ id: "b", name: "Beta", openRoleCount: 12 }),
      ],
      "en",
    );
    expect(stats.hiring.rolesCapped).toBe(false);
    expect(stats.hiring.top.map((row) => row.name)).toEqual(["Beta", "Alpha"]);
  });

  it("flags the role floor even when the capped company is outside the top list", () => {
    const busy = Array.from({ length: STARTUPS_INSIGHTS_TOP_HIRING }, (_, i) =>
      card({ id: `busy${i}`, name: `Busy ${i}`, openRoleCount: 39 }),
    );
    const stats = buildStartupInsights(
      [...busy, card({ id: "cap", name: "Zeta", openRoleCount: 40 })],
      "en",
    );
    expect(stats.hiring.rolesCapped).toBe(true);
  });

  it("buckets cited sources and counts exits", () => {
    const stats = buildStartupInsights(
      [
        card({ id: "1" }),
        card({
          id: "3",
          sources: [
            "https://one.example/a",
            "https://two.example/b",
            "https://three.example/c",
          ],
          exitStatus: "acquired",
        }),
        card({ id: "ipo", exitStatus: "ipo" }),
      ],
      "en",
    );
    expect(stats.sourceDepth).toEqual([
      { sources: 1, count: 2 },
      { sources: 2, count: 0 },
      { sources: 3, count: 1 },
    ]);
    expect(stats.exits).toEqual({ acquired: 1, ipo: 1, shutdown: 0 });
  });

  it("shows a timeline only once listings span three months", () => {
    const twoMonths = buildStartupInsights(
      [
        card({ id: "a", listedOn: "2026-08-01" }),
        card({ id: "b", listedOn: "2026-09-01" }),
      ],
      "en",
    );
    expect(STARTUPS_INSIGHTS_TIMELINE_MIN_MONTHS).toBe(3);
    expect(twoMonths.timeline).toBeNull();
    const threeMonths = buildStartupInsights(
      [
        card({ id: "a", listedOn: "2026-07-01" }),
        card({ id: "b", listedOn: "2026-08-01" }),
        card({ id: "c", listedOn: "2026-09-01" }),
        card({ id: "d", listedOn: "2026-09-15" }),
      ],
      "nl",
    );
    expect(threeMonths.timeline?.map((row) => [row.month, row.count])).toEqual([
      ["2026-07", 1],
      ["2026-08", 1],
      ["2026-09", 2],
    ]);
  });

  it("keeps stage only when sourced", () => {
    const stats = buildStartupInsights(
      [card({ id: "a", stage: "Seed" }), card({ id: "b", stage: "  " })],
      "en",
    );
    expect(stats.stageMix).toEqual([{ stage: "Seed", count: 1 }]);
  });
});

function shareStats(
  overrides: Partial<StartupsInsightsStats> = {},
): StartupsInsightsStats {
  return {
    total: 8172,
    countryCount: 2,
    countries: {
      rows: [
        { code: "IL", label: "Israel", count: 4200 },
        { code: "US", label: "United States", count: 2800 },
      ],
      other: { companies: 0, countries: 0 },
      unplaced: 172,
    },
    categories: [
      { id: "vertical", label: "Vertical", count: 5000, hiring: 300 },
      { id: "models", label: "Models", count: 2000, hiring: 100 },
    ],
    hiring: {
      companies: 460,
      roles: 3635,
      rolesCapped: true,
      bands: [],
      top: [],
    },
    exits: { acquired: 0, ipo: 0, shutdown: 0 },
    sourceDepth: [],
    timeline: null,
    stageMix: null,
    ...overrides,
  };
}

describe("startup insights Open Graph", () => {
  it("formats Open Graph from live hiring counts", () => {
    const facts = startupInsightsShareFacts(shareStats());
    expect(facts).toEqual({
      companies: 8172,
      hiringCompanies: 460,
      roles: 3635,
      rolesCapped: true,
    });
    const spec = startupInsightsOgSpec(facts);
    const t = insightsT("en");
    expect(spec).not.toBeNull();
    expect(t(spec!.titleKey, spec!.titleValues)).toBe(
      "AI startups insights — 8,172 companies, 460 hiring",
    );
    expect(t(spec!.descriptionKey, spec!.descriptionValues)).toBe(
      "Live from the AIT directory: 8,172 AI companies, 460 hiring, at least 3,635 open roles. Nothing estimated.",
    );
  });

  it("drops at least when the role count is exact", () => {
    const facts = startupInsightsShareFacts(
      shareStats({
        hiring: {
          companies: 2,
          roles: 5,
          rolesCapped: false,
          bands: [],
          top: [],
        },
      }),
    );
    const spec = startupInsightsOgSpec(facts)!;
    expect(insightsT("en")(spec.descriptionKey, spec.descriptionValues)).toBe(
      "Live from the AIT directory: 8,172 AI companies, 2 hiring, 5 open roles. Nothing estimated.",
    );
  });

  it("leaves hiring out of the title when nobody is hiring", () => {
    const facts = startupInsightsShareFacts(
      shareStats({
        total: 6,
        hiring: {
          companies: 0,
          roles: 0,
          rolesCapped: false,
          bands: [],
          top: [],
        },
      }),
    );
    const spec = startupInsightsOgSpec(facts)!;
    expect(spec.titleKey).toBe("shareOgTitleNoHiring");
    expect(insightsT("nl")(spec.titleKey, spec.titleValues)).toBe(
      "AI-startups inzichten — 6 bedrijven",
    );
  });

  it("keeps an empty directory off counted Open Graph", () => {
    const facts = startupInsightsShareFacts(buildStartupInsights([], "en"));
    expect(facts.companies).toBe(0);
    expect(startupInsightsOgSpec(facts)).toBeNull();
  });
});
