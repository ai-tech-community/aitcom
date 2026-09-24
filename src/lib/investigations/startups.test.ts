import { describe, expect, it } from "vitest";

import {
  STARTUPS_BATCH_MAX,
  STARTUPS_H1,
  STARTUPS_INSIGHTS_PATH,
  startupsInsightsShareUrl,
  STARTUPS_JOBS_PATH,
  JOBS_ROLE_JOIN_HREF,
  STARTUPS_JOIN_HREF,
  STARTUPS_META,
  STARTUPS_PATH,
  STARTUP_CATEGORY_IDS,
  applyStartupDirectoryQuery,
  buildStartupDirectoryPath,
  displayStartupSourceChips,
  displayStartupSources,
  formatStartupExitBadge,
  normalizeStartupHomepage,
  startupFounderInitials,
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
  startupInvestigationSitemapPaths,
  startupMapPins,
  startupHasOpenJobs,
  startupNewsSources,
  STARTUP_PIN_ZOOM,
  formatStartupPinCoords,
  startupMonogram,
  parseStartupListedOn,
  startupProfileFacts,
  startupProfileSections,
  startupReferenceSources,
  startupProfileJsonLd,
  startupProfileSitemapPaths,
  startupSourceFaviconUrl,
  startupsDirectoryJsonLd,
  startupsPublicIndexable,
  startupsPublicRobots,
  STARTUPS_PUBLIC_INDEX_MIN,
  allocateStartupSlug,
  buildStartupJobsPath,
  buildStartupProfilePath,
  buildStartupRolePath,
  parseStartupSlug,
  startupSlugFromName,
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

function organizationFromDirectory(card: StartupPublicCard) {
  const data = startupsDirectoryJsonLd([card]);
  const item = (
    data.itemListElement as Array<{ item: Record<string, unknown> }>
  )[0]?.item;
  return { data, item };
}

/** Profile and directory Organization nodes share the same sameAs rule. */
function expectSameAs(card: StartupPublicCard, sameAs: string[]) {
  const profile = startupProfileJsonLd(card);
  const { data, item } = organizationFromDirectory(card);
  expect(profile.sameAs).toEqual(sameAs);
  expect(item?.sameAs).toEqual(sameAs);
  expect(JSON.stringify(profile)).not.toContain("eu-startups.com");
  expect(JSON.stringify(data)).not.toContain("eu-startups.com");
}

function expectNoEuStartupsSameAs(card: StartupPublicCard) {
  const profile = startupProfileJsonLd(card);
  const { data, item } = organizationFromDirectory(card);
  expect(profile).not.toHaveProperty("sameAs");
  expect(item).not.toHaveProperty("sameAs");
  expect(JSON.stringify(profile)).not.toContain("eu-startups.com");
  expect(JSON.stringify(data)).not.toContain("eu-startups.com");
}

describe("startups investigation contract", () => {
  it("lives under /startups with a dedicated insights path", () => {
    expect(STARTUPS_PATH).toBe("/startups");
    expect(STARTUPS_INSIGHTS_PATH).toBe("/startups/insights");
    expect(startupsInsightsShareUrl("en")).toBe(
      "https://www.aitcommunity.org/en/startups/insights",
    );
    expect(startupsInsightsShareUrl("nl")).toBe(
      "https://www.aitcommunity.org/nl/startups/insights",
    );
    expect(startupsInsightsShareUrl("en")).not.toContain("/communities/");
    expect(startupsInsightsShareUrl("nl")).not.toMatch(/hub/i);
    expect(STARTUPS_JOBS_PATH).toBe("/jobs");
    expect(STARTUPS_H1).toBe("AI startups worth watching");
    expect(STARTUPS_META).toMatch(/homepage and sources verified/i);
    expect(STARTUPS_META).not.toMatch(BANNED_METRIC);
  });

  it("uses a hard www Join door with startups UTMs", () => {
    expect(STARTUPS_JOIN_HREF).toBe(
      "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=startups&utm_campaign=startups",
    );
    const url = new URL(STARTUPS_JOIN_HREF);
    expect(url.origin).toBe("https://www.aitcommunity.org");
    expect(url.pathname).toBe("/en/join");
    expect(url.searchParams.get("utm_source")).toBe("aitcom");
    expect(url.searchParams.get("utm_medium")).toBe("startups");
    expect(url.searchParams.get("utm_campaign")).toBe("startups");
    expect(url.pathname).not.toContain("forum");
  });

  it("uses a hard /en/join door with a jobs campaign on role pages", () => {
    expect(JOBS_ROLE_JOIN_HREF).toContain("/en/join");
    expect(JOBS_ROLE_JOIN_HREF).not.toContain("/nl/join");
    const url = new URL(JOBS_ROLE_JOIN_HREF);
    expect(url.pathname).toBe("/en/join");
    expect(url.searchParams.get("utm_source")).toBe("aitcom");
    expect(url.searchParams.get("utm_medium")).toBe("jobs");
    expect(url.searchParams.get("utm_campaign")).toBe("jobs");
    expect(JOBS_ROLE_JOIN_HREF).not.toBe(STARTUPS_JOIN_HREF);
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

  it("labels sources as Docs · Deep dive · Talk · News, or a sourced title", () => {
    expect(startupSourceLabel("https://en.wikipedia.org/wiki/Anthropic")).toBe(
      "Wikipedia",
    );
    expect(startupSourceLabel("https://techcrunch.com/tag/anthropic/")).toBe(
      "TechCrunch",
    );
    expect(
      startupSourceLabel(
        "https://www.datacenterdynamics.com/en/analysis/in-perfect-harmony-how-emerald-ai-is-turning-data-centers-into-flexible-grid-assets/",
      ),
    ).toBe("Data Center Dynamics");
    expect(startupSourceLabel("https://cohere.com/about")).toBe("Docs");
    expect(startupSourceLabel("https://cohere.com/about", "nl")).toBe("Docs");
    expect(startupSourceLabel("https://weaviate.io/blog")).toBe("Deep dive");
    expect(startupSourceLabel("https://www.crusoe.ai/resources/newsroom")).toBe(
      "News",
    );
    expect(startupSourceLabel("https://www.youtube.com/watch?v=abc")).toBe(
      "Talk",
    );
    expect(startupSourceLabel("https://obscure.example/path")).toBe("Docs");
    expect(startupSourceLabel("https://cursor.com/blog/joining-spacex")).toBe(
      "Cursor: Joining SpaceX",
    );
    expect(
      startupSourceLabel("https://www.cursor.com/blog/joining-spacex/"),
    ).toBe("Cursor: Joining SpaceX");
    expect(
      startupSourceLabel(
        "https://cursor.com/blog/joining-spacex?utm_source=ops",
      ),
    ).toBe("Cursor: Joining SpaceX");
    expect(
      startupSourceLabel("https://cursor.com/blog/joining-spacex", "nl"),
    ).toBe("Cursor: Joining SpaceX");
    expect(
      startupSourceLabel(
        "https://airtable.com/appyexehrnzkMquvH/shrTechAvivUnicorns",
      ),
    ).toBe("TechAviv");
    expect(
      startupSourceLabel("https://www.airtable.com/appyexehrnzkMquvH/"),
    ).toBe("TechAviv");
    expect(
      startupSourceLabel(
        "https://airtable.com/appyexehrnzkMquvH/shrShare?utm_source=ops",
      ),
    ).toBe("TechAviv");
    expect(
      startupSourceLabel(
        "https://airtable.com/appyexehrnzkMquvH/shrShare",
        "nl",
      ),
    ).toBe("TechAviv");
    expect(
      startupSourceLabel("https://airtable.com/appOtherBase/shrNotTechAviv"),
    ).toBe("Docs");
    expect(
      startupSourceLabel(
        "https://www.gigasheet.com/sample-data/free-israel-business-listcsv",
      ),
    ).toBe("Gigasheet");
    expect(
      startupSourceLabel(
        "https://gigasheet.com/sample-data/free-israel-business-listcsv/",
      ),
    ).toBe("Gigasheet");
    expect(
      startupSourceLabel(
        "https://www.gigasheet.com/sample-data/free-israel-business-listcsv?ref=ops",
      ),
    ).toBe("Gigasheet");
    expect(
      startupSourceLabel(
        "https://www.gigasheet.com/sample-data/free-israel-business-listcsv",
        "nl",
      ),
    ).toBe("Gigasheet");
    expect(
      startupSourceLabel("https://www.gigasheet.com/sample-data/other-list"),
    ).toBe("Docs");
    for (const href of [
      "https://en.wikipedia.org/wiki/Anthropic",
      "https://cohere.com/about",
      "https://weaviate.io/blog",
      "https://www.crusoe.ai/resources/newsroom",
      "https://obscure.example/path",
    ]) {
      expect(startupSourceLabel(href)).not.toMatch(/^[123]$/);
    }
  });

  it("dedupes source chip labels so News never appears twice", () => {
    expect(
      displayStartupSourceChips(
        [
          "https://example.com/news/one",
          "https://example.com/news/two",
          "https://en.wikipedia.org/wiki/Example",
        ],
        "en",
      ),
    ).toEqual([
      { href: "https://example.com/news/one", label: "News" },
      { href: "https://en.wikipedia.org/wiki/Example", label: "Wikipedia" },
    ]);
    expect(
      displayStartupSourceChips(
        [
          "https://cursor.com/about",
          "https://cursor.com/blog/joining-spacex",
          "https://en.wikipedia.org/wiki/Cursor_(code_editor)",
        ],
        "en",
      ).map((chip) => chip.label),
    ).toEqual(["Docs", "Cursor: Joining SpaceX", "Wikipedia"]);
    expect(
      displayStartupSourceChips(
        [
          "https://techcrunch.com/2024/01/skild-one",
          "https://techcrunch.com/2024/06/skild-two",
          "https://techcrunch.com/2025/01/skild-three",
        ],
        "en",
      ),
    ).toEqual([
      {
        href: "https://techcrunch.com/2024/01/skild-one",
        label: "TechCrunch",
      },
    ]);
  });

  it("labels the TechAviv Airtable unicorn share as TechAviv, not Docs or News", () => {
    const airtable =
      "https://airtable.com/appyexehrnzkMquvH/shrTechAvivUnicorns";
    const companyPage = "https://example-startup.com/";
    expect(
      displayStartupSourceChips([airtable, companyPage], "en").map(
        (chip) => chip.label,
      ),
    ).toEqual(["TechAviv", "Docs"]);
    expect(
      displayStartupSourceChips([airtable, companyPage], "nl").map(
        (chip) => chip.label,
      ),
    ).toEqual(["TechAviv", "Docs"]);
    expect(
      displayStartupSourceChips(
        [
          airtable,
          "https://example-startup.com/news/one",
          "https://example-startup.com/news/two",
        ],
        "en",
      ).map((chip) => chip.label),
    ).toEqual(["TechAviv", "News"]);
  });

  it("labels the Gigasheet Israel business sample as Gigasheet, not Docs or News", () => {
    const gigasheet =
      "https://www.gigasheet.com/sample-data/free-israel-business-listcsv";
    const companyPage = "https://example-startup.com/";
    expect(
      displayStartupSourceChips([gigasheet, companyPage], "en").map(
        (chip) => chip.label,
      ),
    ).toEqual(["Gigasheet", "Docs"]);
    expect(
      displayStartupSourceChips([gigasheet, companyPage], "nl").map(
        (chip) => chip.label,
      ),
    ).toEqual(["Gigasheet", "Docs"]);
    expect(
      displayStartupSourceChips(
        [
          gigasheet,
          "https://example-startup.com/news/one",
          "https://example-startup.com/news/two",
        ],
        "en",
      ).map((chip) => chip.label),
    ).toEqual(["Gigasheet", "News"]);
  });

  it("keeps the Production Cursor sources URL as the Joining SpaceX chip", () => {
    const sources = [
      "https://en.wikipedia.org/wiki/Cursor_(code_editor)",
      "https://cursor.com/about",
      "https://cursor.com/blog/joining-spacex",
    ];
    expect(
      displayStartupSourceChips(sources, "en").find(
        (chip) => chip.href === "https://cursor.com/blog/joining-spacex",
      ),
    ).toEqual({
      href: "https://cursor.com/blog/joining-spacex",
      label: "Cursor: Joining SpaceX",
    });
  });

  it("builds favicon URLs from the real source host only", () => {
    expect(
      startupSourceFaviconUrl("https://cursor.com/blog/joining-spacex"),
    ).toBe("https://cursor.com/favicon.ico");
    expect(
      startupSourceFaviconUrl(
        "https://en.wikipedia.org/wiki/Cursor_(code_editor)",
      ),
    ).toBe("https://en.wikipedia.org/favicon.ico");
    expect(
      startupSourceFaviconUrl("https://techcrunch.com/2024/01/skild"),
    ).toBe("https://techcrunch.com/favicon.ico");
    expect(startupSourceFaviconUrl("not-a-url")).toBeNull();
    expect(
      startupSourceFaviconUrl("https://cursor.com/blog/joining-spacex"),
    ).not.toMatch(/google\.com\/s2|duckduckgo|gstatic/i);
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
    ).toEqual([{ name: "Ada", url: null, imageUrl: null }]);
    expect(
      sanitizeStartupFounders([
        { name: "Ada", url: "https://ada.example/about" },
        { name: "Ada", url: "javascript:alert(1)" },
      ]),
    ).toEqual([
      { name: "Ada", url: "https://ada.example/about", imageUrl: null },
      { name: "Ada", url: null, imageUrl: null },
    ]);
    expect(
      sanitizeStartupFounders([
        {
          name: "Ada",
          photo_url: "https://ada.example/ada.jpg",
        },
        {
          name: "Invented Face",
          imageUrl: "javascript:alert(1)",
        },
      ]),
    ).toEqual([
      {
        name: "Ada",
        url: null,
        imageUrl: "https://ada.example/ada.jpg",
      },
      { name: "Invented Face", url: null, imageUrl: null },
    ]);
    expect(startupFounderInitials("Michael Truell")).toBe("MT");
    expect(startupFounderInitials("Ada")).toBe("A");
    expect(
      formatStartupExitBadge({
        exitStatus: "acquired",
        acquirer: "SpaceX",
        exitOn: "2026",
      }),
    ).toBe("Acquired·SpaceX·2026");
    expect(
      formatStartupExitBadge({
        exitStatus: "ipo",
        acquirer: null,
        exitOn: "2024",
      }),
    ).toBe("IPO·2024");
    expect(
      formatStartupExitBadge({
        exitStatus: null,
        acquirer: "SpaceX",
        exitOn: "2026",
      }),
    ).toBeNull();
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
    expect(mapped.founders).toEqual([
      { name: "Michael Truell", url: null, imageUrl: null },
    ]);
    expect(mapped.logoUrl).toBe("https://cursor.com/og.png");
    expect(mapped.description).toBeNull();
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
        blurb: "Open-source vector database.",
      }),
    ).toMatchObject({
      founders: [],
      exitStatus: null,
      acquirer: null,
      exitOn: null,
      category: "ai-infra",
      description: "Open-source vector database.",
    });
    expect(
      mapPulseStartupWrite({
        name: "Quiet Co",
        homepage: "https://quiet.example/",
        category: "other",
        sources: ["https://quiet.example/about"],
        description: "   ",
        blurb: null,
      }).description,
    ).toBeNull();
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

    expect(city?.precision).toBe("city");
    expect(stored?.precision).toBe("city");
    const country = verifiedStartupPin(sampleCard({ region: "Israel" }));
    expect(country?.precision).toBe("region");
    // Writes store the resolved centroid, so stored centroid coords stay region-level.
    expect(
      verifiedStartupPin(
        sampleCard({ region: "Israel", lat: country!.lat, lng: country!.lng }),
      )?.precision,
    ).toBe("region");
    expect(STARTUP_PIN_ZOOM.region).toBeLessThan(STARTUP_PIN_ZOOM.city);

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

    const liveStyle = startupMapPins([
      sampleCard({
        id: "israel",
        region: "Israel",
        lat: null,
        lng: null,
      }),
      sampleCard({
        id: "sf",
        region: "San Francisco, CA, USA",
        lat: null,
        lng: null,
      }),
      sampleCard({
        id: "blank",
        region: null,
        lat: null,
        lng: null,
      }),
    ]);
    expect(liveStyle).toHaveLength(2);
    expect(liveStyle.map((pin) => pin.region).sort()).toEqual([
      "Israel",
      "San Francisco, CA, USA",
    ]);
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
        openRoleCount: 2,
      }),
      sampleCard({
        id: "oklo",
        name: "Oklo",
        category: "energy",
        exitStatus: "ipo",
        exitOn: "2024",
        jobsUrl: "https://oklo.com/careers",
        openRoleCount: 0,
      }),
      sampleCard({
        id: "cursor",
        name: "Cursor (Anysphere)",
        category: "agents",
        exitStatus: "acquired",
        acquirer: "SpaceX",
        exitOn: "2026",
        jobsUrl: "https://cursor.com/careers",
        openRoleCount: 1,
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
    ).toEqual(["toronto", "cursor"]);
  });

  it("treats hiring as sourced open roles, not merely a careers URL", () => {
    const closed = sampleCard({
      jobsUrl: "https://co.example/careers",
      openRoleCount: 0,
    });
    const open = sampleCard({
      id: "open",
      jobsUrl: "https://open.example/careers",
      openRoleCount: 2,
    });
    expect(startupHasOpenJobs(closed)).toBe(false);
    expect(startupHasOpenJobs(open)).toBe(true);
    expect(
      applyStartupDirectoryQuery(
        [closed, open],
        { q: "", category: "all", hiring: "hiring" },
        "en",
      ).map((card) => card.id),
    ).toEqual(["open"]);
    expect(startupProfileSections(closed)).not.toContain("hiring");
    expect(startupProfileSections(open)).toContain("hiring");
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
      view: "table",
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
    expect(startupDirectorySitemapPaths(279)).toEqual(
      Array.from(
        { length: 11 },
        (_, index) => `${STARTUPS_PATH}?page=${index + 2}`,
      ),
    );
    expect(startupDirectorySitemapPaths(279).at(-1)).toBe(
      `${STARTUPS_PATH}?page=12`,
    );
    expect(startupDirectorySitemapPaths(279)).not.toContain(STARTUPS_PATH);
    expect(startupDirectorySitemapPaths(279)).not.toContain(
      STARTUPS_INSIGHTS_PATH,
    );
    expect(startupDirectorySitemapPaths(3479)).toHaveLength(144);
    expect(startupDirectorySitemapPaths(3479).at(-1)).toBe(
      `${STARTUPS_PATH}?page=145`,
    );
    expect(STARTUPS_PUBLIC_INDEX_MIN).toBe(3000);
    expect(startupsPublicIndexable(20)).toBe(false);
    expect(startupsPublicIndexable(2999)).toBe(false);
    expect(startupsPublicIndexable(3000)).toBe(true);
    expect(startupsPublicRobots(20)).toEqual({ index: true, follow: true });
    expect(startupsPublicRobots(2999)).toEqual({ index: true, follow: true });
    expect(startupsPublicRobots(3000)).toEqual({ index: true, follow: true });
    expect(startupInvestigationSitemapPaths(20)).toEqual([
      STARTUPS_PATH,
      STARTUPS_INSIGHTS_PATH,
      STARTUPS_JOBS_PATH,
    ]);
    expect(startupInvestigationSitemapPaths(51)).toEqual([
      STARTUPS_PATH,
      STARTUPS_INSIGHTS_PATH,
      STARTUPS_JOBS_PATH,
      `${STARTUPS_PATH}?page=2`,
      `${STARTUPS_PATH}?page=3`,
    ]);
    expect(startupInvestigationSitemapPaths(3000)).toEqual([
      STARTUPS_PATH,
      STARTUPS_INSIGHTS_PATH,
      STARTUPS_JOBS_PATH,
      ...startupDirectorySitemapPaths(3000),
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

describe("startup slugs and profile contract", () => {
  it("slugifies names and suffixes collisions with -2", () => {
    expect(startupSlugFromName("Cursor (Anysphere)")).toBe("cursor-anysphere");
    expect(startupSlugFromName("1X Technologies")).toBe("1x-technologies");
    expect(startupSlugFromName("Hugging Face")).toBe("hugging-face");
    expect(startupSlugFromName("  ")).toBe("startup");
    expect(parseStartupSlug("Cursor-Anysphere")).toBe("cursor-anysphere");
    expect(parseStartupSlug("not a slug")).toBeNull();
    expect(parseStartupSlug("insights")).toBe("insights");
    expect(allocateStartupSlug("Fixture Co", [])).toBe("fixture-co");
    expect(allocateStartupSlug("Fixture Co", ["fixture-co"])).toBe(
      "fixture-co-2",
    );
    expect(
      allocateStartupSlug("Fixture Co", ["fixture-co", "fixture-co-2"]),
    ).toBe("fixture-co-3");
    expect(allocateStartupSlug("Insights", [])).toBe("insights-2");
    expect(allocateStartupSlug("Jobs", [])).toBe("jobs-2");
    expect(allocateStartupSlug("Fixture Co", ["taken"], "custom-slug")).toBe(
      "custom-slug",
    );
    expect(buildStartupProfilePath("cursor-anysphere")).toBe(
      "/startups/cursor-anysphere",
    );
    expect(buildStartupRolePath("cursor-anysphere-staff-engineer")).toBe(
      "/jobs/cursor-anysphere-staff-engineer",
    );
    expect(buildStartupJobsPath({ company: "cursor-anysphere" })).toBe(
      "/jobs?company=cursor-anysphere",
    );
    expect(buildStartupJobsPath({ page: 2 })).toBe("/jobs?page=2");
  });

  it("lists profile sitemap locs from unique usable slugs only", () => {
    expect(
      startupProfileSitemapPaths([
        "cursor-anysphere",
        "cursor-anysphere",
        "Insights",
        "jobs",
        "not a slug",
        "  ",
        "hugging-face",
      ]),
    ).toEqual(["/startups/cursor-anysphere", "/startups/hugging-face"]);
  });

  it("soft-omits empty profile sections and facts", () => {
    const bare = sampleCard();
    expect(startupProfileSections(bare)).toEqual([]);
    expect(startupNewsSources(bare.sources)).toEqual([]);
    expect(startupProfileFacts(bare)).toEqual(["listed", "sources"]);

    const rich = sampleCard({
      region: "Toronto, Canada",
      lat: 43.65,
      lng: -79.38,
      stage: "Series B",
      exitStatus: "acquired",
      acquirer: "SpaceX",
      exitOn: "2026",
      jobsUrl: "https://fixture.example/careers",
      openRoleCount: 2,
      listedOn: "2026-09-15",
      founders: [{ name: "Ada Example", url: null, imageUrl: null }],
      sources: [
        "https://fixture.example/about",
        "https://fixture.example/newsroom",
      ],
    });
    expect(startupProfileSections(rich)).toEqual([
      "founders",
      "hiring",
      "news",
    ]);
    expect(startupProfileFacts(rich)).toEqual([
      "region",
      "stage",
      "listed",
      "sources",
    ]);
    expect(startupNewsSources(rich.sources)).toEqual([
      "https://fixture.example/newsroom",
    ]);
    expect(startupReferenceSources(rich.sources)).toEqual([
      "https://fixture.example/about",
    ]);

    const pressOnly = sampleCard({
      sources: ["https://fixture.example/newsroom"],
    });
    expect(startupProfileFacts(pressOnly)).not.toContain("sources");
    expect(startupProfileSections(pressOnly)).toEqual(["news"]);
  });

  it("builds a letters-only monogram for logo-less companies", () => {
    expect(startupMonogram("@hop")).toBe("H");
    expect(startupMonogram("Fixture Co")).toBe("FC");
    expect(startupMonogram("4Point AI")).toBe("4A");
    expect(startupMonogram("  ")).toBe("?");
    expect(startupMonogram("Été Labs")).toBe("ÉL");
  });

  it("keeps the map view in the URL without pages and canonicalises it to the table", () => {
    expect(parseStartupDirectoryQuery({ view: "map" }).view).toBe("map");
    expect(parseStartupDirectoryQuery({ view: "globe" }).view).toBe("table");
    expect(parseStartupDirectoryQuery({}).view).toBe("table");
    expect(
      buildStartupDirectoryPath({ view: "map", page: 4, category: "agents" }),
    ).toBe("/startups?category=agents&view=map");
    expect(buildStartupDirectoryPath({ view: "table", page: 4 })).toBe(
      "/startups?page=4",
    );
    expect(
      startupDirectoryCanonicalPath(
        parseStartupDirectoryQuery({ view: "map", page: "3" }),
      ),
    ).toBe("/startups");
  });

  it("reads the listing date and never invents one", () => {
    expect(parseStartupListedOn("2026-09-15")).toBe("2026-09-15");
    expect(parseStartupListedOn("2026-09-15T08:00:00.000Z")).toBe("2026-09-15");
    expect(parseStartupListedOn("")).toBeNull();
    expect(parseStartupListedOn("soon")).toBeNull();
    expect(startupProfileFacts(sampleCard({ listedOn: "" }))).not.toContain(
      "listed",
    );
  });

  it("formats pin coordinates as approximate, one decimal, with hemispheres", () => {
    expect(formatStartupPinCoords({ lat: 43.6532, lng: -79.3832 })).toBe(
      "≈ 43.7° N, 79.4° W",
    );
    expect(formatStartupPinCoords({ lat: -33.87, lng: 151.21 })).toBe(
      "≈ 33.9° S, 151.2° E",
    );
  });

  it("emits Organization JSON-LD from sourced fields only", () => {
    const blank = startupProfileJsonLd(sampleCard());
    expect(blank).toEqual({
      "@type": "Organization",
      name: "Fixture Co",
      url: "https://fixture.example",
    });
    expect(blank).not.toHaveProperty("sameAs");
    expect(blank).not.toHaveProperty("description");
    expect(JSON.stringify(blank)).not.toMatch(BANNED_METRIC);
    expect(JSON.stringify(blank)).not.toMatch(/"@type":"Person"/);
    expect(JSON.stringify(blank)).not.toMatch(/streetAddress|addressLocality/);

    const sourced = startupProfileJsonLd(
      sampleCard({
        description: "Sourced short blurb from Pulse.",
        logoUrl: "https://fixture.example/logo.png",
        founders: [
          {
            name: "Ada Example",
            url: "https://ada.example",
            imageUrl: "https://ada.example/ada.jpg",
          },
        ],
      }),
    );
    expect(sourced.description).toBe("Sourced short blurb from Pulse.");
    expect(sourced.logo).toBe("https://fixture.example/logo.png");
    expect(JSON.stringify(sourced)).not.toContain(
      "https://ada.example/ada.jpg",
    );
    expect(JSON.stringify(sourced)).not.toContain("Person");
    expect(sourced.description).not.toMatch(/worth watching/i);
  });

  it("omits sameAs when sources are only an eu-startups directory citation", () => {
    const directory = "https://www.eu-startups.com/directory/fixture-co/";
    const card = sampleCard({ sources: [directory] });
    expect(displayStartupSources(card.sources)).toEqual([
      "https://www.eu-startups.com/directory/fixture-co",
    ]);
    expect(displayStartupSourceChips(card.sources)).toEqual([
      {
        href: "https://www.eu-startups.com/directory/fixture-co",
        label: "Docs",
      },
    ]);
    expectNoEuStartupsSameAs(card);
  });

  it("keeps sameAs to LinkedIn when sources mix a directory citation and LinkedIn", () => {
    const directory = "https://eu-startups.com/directory/fixture-co";
    const linkedin = "https://www.linkedin.com/company/fixture-co";
    const card = sampleCard({ sources: [directory, linkedin] });
    expect(displayStartupSources(card.sources)).toEqual([directory, linkedin]);
    expectSameAs(card, [linkedin]);
  });

  it("uses a LinkedIn profile as sameAs when it is the only source", () => {
    const linkedin = "https://www.linkedin.com/in/ada-example";
    const card = sampleCard({ sources: [linkedin] });
    expect(displayStartupSources(card.sources)).toEqual([linkedin]);
    expectSameAs(card, [linkedin]);
  });
});

describe("json-ld", () => {
  it("page-scopes ItemList to the current Directory slice", () => {
    const cards = Array.from({ length: 80 }, (_, index) =>
      sampleCard({ id: `n-${index}`, name: `Co ${index}` }),
    );
    const page = paginateStartupCards(cards, 3);
    expect(page.items).toHaveLength(24);
    expect(page.items[0]?.name).toBe("Co 48");
    const data = startupsDirectoryJsonLd(page.items);
    const items = data.itemListElement as Array<{
      position: number;
      item: { name: string };
    }>;
    expect(items).toHaveLength(24);
    expect(items).toHaveLength(page.pageSize);
    expect(items[0]?.item.name).toBe("Co 48");
    expect(items[0]?.position).toBe(1);
    expect(items.at(-1)?.item.name).toBe("Co 71");
    expect(JSON.stringify(data)).not.toContain("Co 0");
    expect(JSON.stringify(data)).not.toContain("Co 47");
  });

  it("emits Organization items from listed cards only", () => {
    const data = startupsDirectoryJsonLd([sampleCard()]);
    expect(data["@type"]).toBe("ItemList");
    expect(JSON.stringify(data)).not.toMatch(BANNED_METRIC);
    expect(JSON.stringify(data)).not.toMatch(
      /"@type":"Person"|founder.*image/i,
    );
    const item = (
      data.itemListElement as Array<{
        item: { name: string; url: string; description?: string };
      }>
    )[0]?.item;
    expect(item).toMatchObject({
      "@type": "Organization",
      name: "Fixture Co",
      url: "https://fixture.example",
    });
    expect(item).not.toHaveProperty("sameAs");
    expect(item).not.toHaveProperty("description");
    const withFounderPhoto = startupsDirectoryJsonLd([
      sampleCard({
        founders: [
          {
            name: "Ada Example",
            url: "https://ada.example",
            imageUrl: "https://ada.example/ada.jpg",
          },
        ],
      }),
    ]);
    expect(JSON.stringify(withFounderPhoto)).not.toContain(
      "https://ada.example/ada.jpg",
    );
    expect(JSON.stringify(withFounderPhoto)).not.toContain("Person");
  });

  it("includes Organization description only when a sourced blurb exists", () => {
    const blank = startupsDirectoryJsonLd([
      sampleCard({ description: null }),
      sampleCard({
        id: "whitespace",
        description: "   ",
      }),
    ]);
    expect(JSON.stringify(blank)).not.toContain('"description"');

    const sourced = startupsDirectoryJsonLd([
      sampleCard({
        description: "Sourced short blurb from Pulse.",
      }),
    ]);
    const item = (
      sourced.itemListElement as Array<{
        item: { description?: string };
      }>
    )[0]?.item;
    expect(item?.description).toBe("Sourced short blurb from Pulse.");
    expect(item?.description).not.toMatch(/worth watching/i);
  });
});
