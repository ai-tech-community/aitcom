import { describe, expect, it, vi } from "vitest";

import { getCollector } from "./catalog";
import { allPresets, getPreset } from "./presets/catalog";
import { type AnyPreset, definePreset } from "./presets/preset";
import { type CollectorRunsDeps, createCollectorRuns } from "./runs";

const feedItems = getCollector("feed-items")!;
const pageList = getCollector("page-list")!;

function facade(over: Partial<CollectorRunsDeps> = {}) {
  const collectors = [feedItems, pageList];
  return createCollectorRuns({
    // listPresets and recognize never touch the database.
    db: {} as never,
    enabled: () => true,
    catalog: {
      all: () => collectors,
      get: (id) => collectors.find((c) => c.id === id),
    },
    presets: { all: allPresets, get: getPreset },
    kick: vi.fn(),
    now: () => new Date("2026-10-04T12:00:00Z"),
    ...over,
  });
}

describe("listPresets", () => {
  it("lists presets in the member's language with their collector's fields", () => {
    const [feed] = facade().listPresets("nl");
    expect(feed).toEqual({
      id: "feed",
      group: "research",
      title: "Nieuws- of blogfeed",
      summary: expect.stringContaining("RSS"),
      collectorId: "feed-items",
      base: {},
      ask: ["url"],
      fields: [
        {
          name: "url",
          label: "Feedadres",
          help: "Het webadres van de RSS- of Atom-feed.",
          placeholder: "https://example.com/feed.xml",
          columns: null,
        },
      ],
    });
  });

  it("lets a preset's hint replace the collector's hint for that field", () => {
    const hinted = definePreset(feedItems, {
      id: "hinted",
      group: "research",
      title: { en: "Hinted", nl: "Hinted" },
      summary: { en: "x", nl: "x" },
      base: {},
      ask: ["url"],
      hints: {
        url: { label: { en: "Board address", nl: "Adres van het bord" } },
      },
    });
    const [summary] = facade({
      presets: { all: () => [hinted], get: () => hinted },
    }).listPresets("en");
    expect(summary?.fields).toEqual([
      {
        name: "url",
        label: "Board address",
        help: null,
        placeholder: null,
        columns: null,
      },
    ]);
  });

  it("hides presets whose collector is switched off", () => {
    const runs = facade({
      catalog: {
        all: () => [feedItems],
        get: (id) => (id === "feed-items" ? feedItems : undefined),
      },
    });
    expect(runs.listPresets("en").map((p) => p.id)).toEqual(["feed"]);
    expect(runs.recognize("https://example.com/jobs")).toEqual({
      ok: false,
      reason: "no_preset",
    });
  });
});

describe("listTitles", () => {
  it("names every preset and collector, including switched-off ones", () => {
    const runs = facade({
      catalog: {
        all: () => [feedItems],
        get: (id) => (id === "feed-items" ? feedItems : undefined),
      },
    });
    const titles = runs.listTitles("nl");
    expect(titles.collectors).toMatchObject({
      "feed-items": "Feeditems",
      "page-list": "Lijst op een webpagina",
    });
    expect(titles.presets).toMatchObject({
      feed: "Nieuws- of blogfeed",
      "custom-page": "Eigen pagina",
    });
    // Titles only: the switched-off preset still cannot be listed or started.
    expect(runs.listPresets("nl").map((p) => p.id)).toEqual(["feed"]);
  });

  it("uses the member's language", () => {
    const titles = facade().listTitles("en");
    expect(titles.collectors["page-list"]).toBe("List on a web page");
    expect(titles.presets["custom-page"]).toBe("Custom page");
  });
});

describe("recognize", () => {
  it("opens the Custom page with a pasted address it does not know", () => {
    expect(facade().recognize("  example.com/jobs ")).toEqual({
      ok: true,
      presetId: "custom-page",
      matched: false,
      prefill: { url: "https://example.com/jobs" },
    });
  });

  it.each(["hello world", "javascript:alert(1)", "x".repeat(5_000)])(
    "refuses %j as not an address",
    (text) => {
      expect(facade().recognize(text)).toEqual({
        ok: false,
        reason: "not_an_address",
      });
    },
  );

  it("passes on single values as text and drops anything else", () => {
    const board = {
      id: "board",
      group: "jobs",
      title: { en: "Board", nl: "Bord" },
      summary: { en: "x", nl: "x" },
      collectorId: "feed-items",
      base: {},
      ask: ["url"],
      recognize: () => ({
        url: "https://b.example/f",
        limit: 30,
        flag: true,
        nested: { a: 1 },
      }),
    } as AnyPreset;
    expect(
      facade({ presets: { all: () => [board], get: () => board } }).recognize(
        "b.example",
      ),
    ).toEqual({
      ok: true,
      presetId: "board",
      matched: true,
      prefill: { url: "https://b.example/f", limit: "30", flag: "true" },
    });
  });
});
