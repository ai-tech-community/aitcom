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
  startupSourceLabel,
  paginateStartupCards,
  parseStartupCategory,
  parseStartupDirectoryQuery,
  mapPulseStartupWrite,
  parseStartupExitOn,
  parseStartupExitStatus,
  presentText,
  sanitizeStartupFounders,
  sanitizeStartupSources,
  startupDirectoryCanonicalPath,
  startupDirectorySitemapPaths,
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
    founders: [],
    exitStatus: null,
    acquirer: null,
    exitOn: null,
    jobsUrl: null,
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
    expect(url.pathname).not.toContain("forum");
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

  it("labels sources from the URL so links stay crawlable", () => {
    expect(startupSourceLabel("https://en.wikipedia.org/wiki/Anthropic")).toBe(
      "Wikipedia",
    );
    expect(startupSourceLabel("https://techcrunch.com/tag/anthropic/")).toBe(
      "TechCrunch",
    );
    expect(startupSourceLabel("https://cohere.com/about")).toBe("About");
    expect(startupSourceLabel("https://cohere.com/about", "nl")).toBe("Over");
    expect(startupSourceLabel("https://weaviate.io/blog")).toBe("Blog");
    expect(startupSourceLabel("https://obscure.example/path")).toBe(
      "obscure.example",
    );
  });
});

describe("soft-omit helpers", () => {
  it("treats blank region/stage/logo as absent", () => {
    expect(presentText(null)).toBeNull();
    expect(presentText("   ")).toBeNull();
    expect(presentText("Toronto, Canada")).toBe("Toronto, Canada");
  });

  it("keeps sourced founders and exits only; never invents a people graph", () => {
    expect(sanitizeStartupFounders(null)).toEqual([]);
    expect(
      sanitizeStartupFounders([{ name: "  " }, { name: "Ada", url: "" }]),
    ).toEqual([{ name: "Ada", url: null }]);
    expect(
      sanitizeStartupFounders([
        { name: "Ada", url: "https://ada.example/about" },
        { name: "Ada", url: "javascript:alert(1)" },
      ]),
    ).toEqual([
      { name: "Ada", url: "https://ada.example/about" },
      { name: "Ada", url: null },
    ]);
    expect(
      sanitizeStartupFounders(
        Array.from({ length: 12 }, (_, index) => ({
          name: `Founder ${index}`,
        })),
      ),
    ).toHaveLength(8);
    expect(parseStartupExitStatus("acquired")).toBe("acquired");
    expect(parseStartupExitStatus("IPO")).toBe("ipo");
    expect(parseStartupExitStatus("shutdown")).toBe("shutdown");
    expect(parseStartupExitStatus("")).toBeNull();
    expect(parseStartupExitStatus("stealth unicorn")).toBeNull();
    expect(parseStartupExitOn("2024-06-01")).toBe("2024-06-01");
    expect(parseStartupExitOn("2024")).toBe("2024");
    expect(parseStartupExitOn("2026")).toBe("2026");
    expect(parseStartupExitOn("June 2024")).toBeNull();
    expect(parseStartupExitOn("")).toBeNull();
  });

  it("maps Pulse fixture aliases without inventing people or a day", () => {
    const mapped = mapPulseStartupWrite({
      name: "Cursor (Anysphere)",
      homepage: "https://cursor.com/",
      category: "agents",
      sources: ["https://cursor.com/about"],
      logo_url: "https://cursor.com/og.png",
      founders: [{ name: "Michael Truell", url: null }],
      status: "acquired",
      exit_acquirer: "SpaceX",
      exit_year: 2026,
      jobs_url: "https://cursor.com/careers",
    });
    expect(mapped.exitStatus).toBe("acquired");
    expect(mapped.acquirer).toBe("SpaceX");
    expect(mapped.exitOn).toBe("2026");
    expect(mapped.jobsUrl).toBe("https://cursor.com/careers");
    expect(mapped.founders).toEqual([{ name: "Michael Truell", url: null }]);
    expect(mapped.logoUrl).toBe("https://cursor.com/og.png");
    expect(
      mapPulseStartupWrite({
        name: "Weaviate",
        homepage: "https://weaviate.io/",
        category: "AI infra",
        sources: ["https://weaviate.io/company/"],
        founders: null,
        status: "approved",
        exit_year: null,
        jobs_url: "https://weaviate.io/company/careers",
      }),
    ).toMatchObject({
      founders: [],
      exitStatus: null,
      acquirer: null,
      exitOn: null,
      category: "ai-infra",
    });
  });

  it("pins city/HQ or region centroid and lists unknown with no pin", () => {
    expect(verifiedStartupPin(sampleCard())).toBeNull();
    expect(
      verifiedStartupPin(sampleCard({ region: "Unknownville" })),
    ).toBeNull();
    expect(
      verifiedStartupPin(sampleCard({ region: "123 Main Street, Toronto" })),
    ).toBeNull();

    const city = verifiedStartupPin(
      sampleCard({ region: "Toronto, Canada", lat: null, lng: null }),
    );
    expect(city).toMatchObject({
      lat: 43.6532,
      lng: -79.3832,
      region: "Toronto, Canada",
    });
    expect(city?.region).not.toMatch(/street|avenue|road/i);

    const stored = verifiedStartupPin(
      sampleCard({ lat: 43.65, lng: -79.38, region: "Toronto, Canada" }),
    );
    expect(stored).toMatchObject({
      lat: 43.65,
      lng: -79.38,
      region: "Toronto, Canada",
    });

    const coordsOnly = verifiedStartupPin(
      sampleCard({ lat: 40.71, lng: -74.0, region: null }),
    );
    expect(coordsOnly).toMatchObject({ lat: 40.71, lng: -74.0, region: null });

    expect(
      startupMapPins([
        sampleCard(),
        sampleCard({
          id: "pinned",
          region: "New York, US",
          lat: null,
          lng: null,
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

  it("filters region, stage, exit, and hiring from crawlable params", () => {
    const cards = [
      sampleCard({
        id: "toronto",
        name: "Cohere",
        region: "Toronto, Canada",
        jobsUrl: "https://cohere.com/careers",
      }),
      sampleCard({
        id: "oklo",
        name: "Oklo",
        category: "energy",
        exitStatus: "ipo",
        exitOn: "2024",
        jobsUrl: "https://oklo.com/careers",
      }),
      sampleCard({
        id: "cursor",
        name: "Cursor (Anysphere)",
        category: "agents",
        exitStatus: "acquired",
        acquirer: "SpaceX",
        exitOn: "2026",
        jobsUrl: "https://cursor.com/careers",
      }),
      sampleCard({
        id: "quiet",
        name: "Quiet Co",
        stage: "Seed",
        jobsUrl: null,
      }),
    ];
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", region: "Toronto, Canada" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["toronto"]);
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", stage: "Seed" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["quiet"]);
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", status: "active" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["toronto", "quiet"]);
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", status: "ipo" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["oklo"]);
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", hiring: "hiring" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["toronto", "cursor", "oklo"]);
  });

  it("sorts newest, name A–Z, and category without inventing rows", () => {
    const cards = [
      sampleCard({
        id: "z",
        name: "Zed",
        category: "energy",
        listedOn: "2026-09-01",
      }),
      sampleCard({
        id: "a",
        name: "Ada",
        category: "models",
        listedOn: "2026-08-01",
      }),
      sampleCard({
        id: "b",
        name: "Beta",
        category: "agents",
        listedOn: "2026-08-15",
      }),
    ];
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", sort: "newest" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["z", "b", "a"]);
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", sort: "name" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["a", "b", "z"]);
    expect(
      applyStartupDirectoryQuery(
        cards,
        { q: "", category: "all", sort: "category" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["a", "b", "z"]);
  });

  it("canonicalizes filtered views to the directory root", () => {
    const query = parseStartupDirectoryQuery({
      q: "alpha",
      category: "models",
      region: "Toronto, Canada",
      stage: "Seed",
      status: "active",
      hiring: "1",
      sort: "name",
      page: "3",
    });
    expect(query).toEqual({
      q: "alpha",
      category: "models",
      region: "Toronto, Canada",
      stage: "Seed",
      status: "active",
      hiring: "hiring",
      sort: "name",
      page: 3,
    });
    expect(startupDirectoryCanonicalPath(query)).toBe(STARTUPS_PATH);
    expect(buildStartupDirectoryPath({ page: 2 })).toBe(
      `${STARTUPS_PATH}?page=2`,
    );
    expect(
      buildStartupDirectoryPath({
        region: "Toronto, Canada",
        status: "ipo",
        hiring: "hiring",
        sort: "category",
        page: 2,
      }),
    ).toBe(
      `${STARTUPS_PATH}?region=Toronto%2C+Canada&status=ipo&hiring=1&sort=category&page=2`,
    );
    const legacyExit = parseStartupDirectoryQuery({ exit: "ipo" });
    expect(legacyExit.status).toBe("ipo");
    expect(buildStartupDirectoryPath(legacyExit)).toBe(
      `${STARTUPS_PATH}?status=ipo`,
    );
    expect(buildStartupDirectoryPath(legacyExit)).not.toContain("exit=");
  });

  it("emits crawlable ?page= sitemap paths once the directory is past ~50 rows", () => {
    expect(startupDirectorySitemapPaths(20)).toEqual([]);
    expect(startupDirectorySitemapPaths(24)).toEqual([]);
    expect(startupDirectorySitemapPaths(25)).toEqual([
      `${STARTUPS_PATH}?page=2`,
    ]);
    expect(startupDirectorySitemapPaths(50)).toEqual([
      `${STARTUPS_PATH}?page=2`,
      `${STARTUPS_PATH}?page=3`,
    ]);
    const page = paginateStartupCards(
      Array.from({ length: 51 }, (_, index) =>
        sampleCard({ id: `n-${index}` }),
      ),
      1,
    );
    expect(page.totalPages).toBe(3);
    expect(page.items).toHaveLength(24);
  });
});

describe("json-ld", () => {
  it("emits Organization items from listed cards only", () => {
    const data = startupsDirectoryJsonLd([sampleCard()]);
    expect(data["@type"]).toBe("ItemList");
    expect(JSON.stringify(data)).not.toMatch(BANNED_METRIC);
  });
});
