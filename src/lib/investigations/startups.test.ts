import { describe, expect, it } from "vitest";

import {
  STARTUPS_BATCH_MAX,
  STARTUPS_H1,
  STARTUPS_INSIGHTS_PATH,
  STARTUPS_JOIN_HREF,
  STARTUPS_META,
  STARTUPS_PATH,
  STARTUP_CATEGORY_IDS,
  applyStartupDirectoryQuery,
  buildStartupDirectoryPath,
  displayStartupSources,
  normalizeStartupHomepage,
  parseStartupCategory,
  parseStartupDirectoryQuery,
  presentText,
  sanitizeStartupSources,
  startupDirectoryCanonicalPath,
  startupMapPins,
  startupsDirectoryJsonLd,
  verifiedStartupPin,
  type StartupPublicCard,
} from "./startups";

const BANNED_METRIC =
  /valuation|headcount|attendance|unicorn|employees|\bARR\b|largest|growth rate/i;

function sampleCard(
  overrides: Partial<StartupPublicCard> = {},
): StartupPublicCard {
  return {
    id: "fixture-one",
    name: "Fixture Co",
    homepage: "https://fixture.example",
    category: "models",
    sources: ["https://fixture.example/about"],
    region: null,
    lat: null,
    lng: null,
    stage: null,
    logoUrl: null,
    listedOn: "2026-09-15",
    ...overrides,
  };
}

describe("startups investigation contract", () => {
  it("lives under /investigations/startups with a dedicated insights path", () => {
    expect(STARTUPS_PATH).toBe("/investigations/startups");
    expect(STARTUPS_INSIGHTS_PATH).toBe("/investigations/startups/insights");
    expect(STARTUPS_H1).toBe("AI startups");
    expect(STARTUPS_META).toMatch(/homepage and sources verified/i);
    expect(STARTUPS_META).not.toMatch(BANNED_METRIC);
  });

  it("uses a hard www Join door with investigation UTMs", () => {
    expect(STARTUPS_JOIN_HREF).toBe(
      "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=investigations&utm_campaign=startups",
    );
    const url = new URL(STARTUPS_JOIN_HREF);
    expect(url.origin).toBe("https://www.aitcommunity.org");
    expect(url.pathname).toBe("/en/join");
    expect(url.searchParams.get("utm_source")).toBe("aitcom");
    expect(url.searchParams.get("utm_medium")).toBe("investigations");
    expect(url.searchParams.get("utm_campaign")).toBe("startups");
  });

  it("locks the fixed taxonomy and a 30-row API batch cap", () => {
    expect([...STARTUP_CATEGORY_IDS]).toEqual([
      "models",
      "agents",
      "ai-infra",
      "robotics",
      "energy",
      "vertical",
      "other",
    ]);
    expect(STARTUPS_BATCH_MAX).toBe(30);
  });
});

describe("parseStartupCategory", () => {
  it("accepts Pulse labels including AI infra", () => {
    expect(parseStartupCategory("models")).toBe("models");
    expect(parseStartupCategory("AI infra")).toBe("ai-infra");
    expect(parseStartupCategory("ai-infra")).toBe("ai-infra");
    expect(parseStartupCategory("vertical")).toBe("vertical");
    expect(parseStartupCategory("not-a-bucket")).toBeNull();
  });
});

describe("homepage and sources", () => {
  it("normalizes live homepages and rejects fakes", () => {
    expect(normalizeStartupHomepage("https://www.example.com/")).toBe(
      "https://www.example.com",
    );
    expect(normalizeStartupHomepage("javascript:alert(1)")).toBeNull();
    expect(normalizeStartupHomepage("/local")).toBeNull();
    expect(normalizeStartupHomepage("")).toBeNull();
  });

  it("keeps 1–3 unique source URLs and drops the rest", () => {
    expect(
      sanitizeStartupSources([
        "https://a.example/one",
        "https://a.example/one/",
        "https://b.example/two",
        "https://c.example/three",
        "https://d.example/four",
      ]),
    ).toEqual([
      "https://a.example/one",
      "https://b.example/two",
      "https://c.example/three",
    ]);
    expect(displayStartupSources([])).toEqual([]);
    expect(displayStartupSources(["https://a.example"])).toEqual([
      "https://a.example",
    ]);
  });
});

describe("soft-omit helpers", () => {
  it("treats blank region/stage/logo as absent", () => {
    expect(presentText(null)).toBeNull();
    expect(presentText("   ")).toBeNull();
    expect(presentText("Toronto, Canada")).toBe("Toronto, Canada");
  });

  it("pins only verified lat/lng and never invents coordinates", () => {
    expect(verifiedStartupPin(sampleCard())).toBeNull();
    expect(
      verifiedStartupPin(
        sampleCard({ region: "Toronto, Canada", lat: null, lng: null }),
      ),
    ).toBeNull();
    expect(
      verifiedStartupPin(sampleCard({ lat: 43.65, lng: -79.38 })),
    ).toMatchObject({
      lat: 43.65,
      lng: -79.38,
    });
    expect(
      startupMapPins([
        sampleCard(),
        sampleCard({
          id: "pinned",
          lat: 40.71,
          lng: -74.0,
          region: "New York, US",
        }),
      ]),
    ).toHaveLength(1);
  });
});

describe("directory query", () => {
  it("filters by category and search without inventing rows", () => {
    const cards = [
      sampleCard({ id: "a", name: "Alpha", category: "models" }),
      sampleCard({
        id: "b",
        name: "Beta Infra",
        category: "ai-infra",
        listedOn: "2026-08-01",
      }),
    ];
    const filtered = applyStartupDirectoryQuery(
      cards,
      { q: "infra", category: "all" },
      "en",
    );
    expect(filtered.map((card) => card.id)).toEqual(["b"]);
    expect(
      applyStartupDirectoryQuery(cards, { q: "", category: "robotics" }, "en"),
    ).toEqual([]);
  });

  it("canonicalizes filtered views to the directory root", () => {
    const query = parseStartupDirectoryQuery({
      q: "alpha",
      category: "models",
      page: "3",
    });
    expect(query).toEqual({ q: "alpha", category: "models", page: 3 });
    expect(startupDirectoryCanonicalPath(query)).toBe(STARTUPS_PATH);
    expect(buildStartupDirectoryPath({ page: 2 })).toBe(
      `${STARTUPS_PATH}?page=2`,
    );
  });
});

describe("json-ld", () => {
  it("emits Organization items from listed cards only", () => {
    const data = startupsDirectoryJsonLd([sampleCard()]);
    expect(data["@type"]).toBe("ItemList");
    expect(JSON.stringify(data)).not.toMatch(BANNED_METRIC);
  });
});
