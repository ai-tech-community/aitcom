import { describe, expect, it } from "vitest";

import { mainInput, presetIdOfRun, runName, runTarget } from "./run-name";

const presets = [
  { id: "feed", title: "News or blog feed", ask: ["url"] },
  { id: "custom-page", title: "Custom page", ask: ["url", "itemSelector"] },
  { id: "hn", title: "Hacker News", ask: ["list"] },
];
const titles = {
  presets: new Map([
    ["feed", "News or blog feed"],
    ["custom-page", "Custom page"],
    ["hn", "Hacker News"],
  ]),
  collectors: new Map([
    ["feed-items", "Feed items"],
    ["job-board", "Job board"],
  ]),
};
const noTitles = { presets: new Map(), collectors: new Map() };

describe("runTarget", () => {
  it("returns null for input that is not an object", () => {
    expect(runTarget(null)).toBeNull();
    expect(runTarget("https://example.com")).toBeNull();
    expect(runTarget(42)).toBeNull();
  });
  it("returns null when no input value is a string", () => {
    expect(runTarget({ limit: 3 })).toBeNull();
    expect(runTarget({ limit: 5, deep: true })).toBeNull();
  });
  it("shows only the host for a URL whose path is /", () => {
    expect(runTarget({ url: "https://example.com/" })).toBe("example.com");
  });
  it("shows host and path for a URL with a path", () => {
    expect(runTarget({ url: "https://example.com/blog/feed.xml" })).toBe(
      "example.com/blog/feed.xml",
    );
    expect(runTarget({ url: "https://blog.example.org/feed?x=1" })).toBe(
      "blog.example.org/feed",
    );
  });
  it("returns a non-URL string as it is", () => {
    expect(runTarget({ name: "acme" })).toBe("acme");
    expect(runTarget({ limit: 3, query: "open data" })).toBe("open data");
  });
});

describe("mainInput", () => {
  it("reads the named field as a label", () => {
    expect(mainInput({ url: "https://jobs.example.com/careers" }, "url")).toBe(
      "jobs.example.com/careers",
    );
    expect(mainInput({ limit: 30 }, "limit")).toBe("30");
    expect(mainInput({ name: "acme" }, "name")).toBe("acme");
  });
  it("is null for an empty, missing, list or inherited field", () => {
    expect(mainInput({ url: "  " }, "url")).toBeNull();
    expect(mainInput({}, "url")).toBeNull();
    expect(mainInput({ fields: [{ name: "a" }] }, "fields")).toBeNull();
    expect(mainInput({}, "constructor")).toBeNull();
    expect(mainInput({ url: "x" }, undefined)).toBeNull();
  });
});

describe("runName", () => {
  it("names a run by its preset and the preset's first asked input", () => {
    expect(
      runName(
        {
          presetId: "custom-page",
          collectorId: "page-list",
          input: {
            url: "https://jobs.example.com/careers",
            itemSelector: "li",
          },
        },
        presets,
        titles,
      ),
    ).toEqual({ title: "Custom page", detail: "jobs.example.com/careers" });
  });

  it("names a run from before presets by the preset that replaced its collector", () => {
    const run = {
      presetId: null,
      collectorId: "feed-items",
      input: { url: "https://example.com/feed.xml" },
    };
    expect(presetIdOfRun(run)).toBe("feed");
    expect(runName(run, presets, titles)).toEqual({
      title: "News or blog feed",
      detail: "example.com/feed.xml",
    });
  });

  it("falls back to the collector's title and first address when the preset is gone", () => {
    expect(
      runName(
        {
          presetId: "greenhouse-board",
          collectorId: "job-board",
          input: { board: "greenhouse", name: "acme" },
        },
        presets,
        titles,
      ),
    ).toEqual({ title: "Job board", detail: "greenhouse" });
  });

  it("uses the collector id only when nothing better is known", () => {
    expect(
      runName(
        { presetId: null, collectorId: "mystery", input: {} },
        [],
        noTitles,
      ),
    ).toEqual({ title: "mystery", detail: null });
  });

  it("shows a number as the main input", () => {
    expect(
      runName(
        {
          presetId: "hn",
          collectorId: "hacker-news",
          input: { list: "top", limit: 30 },
        },
        presets,
        titles,
      ),
    ).toEqual({ title: "Hacker News", detail: "top" });
  });

  it("titles a run whose preset is switched off from the full title list", () => {
    expect(
      runName(
        {
          presetId: "greenhouse-board",
          collectorId: "job-board",
          input: { board: "greenhouse", name: "acme" },
        },
        presets,
        {
          presets: new Map([["greenhouse-board", "Greenhouse board"]]),
          collectors: titles.collectors,
        },
      ),
    ).toEqual({ title: "Greenhouse board", detail: "greenhouse" });
  });

  it("titles a run from before presets whose collector is switched off", () => {
    const run = {
      presetId: null,
      collectorId: "feed-items",
      input: { url: "https://example.com/feed.xml" },
    };
    // The replacing preset is switched off but still has a title.
    expect(runName(run, [], titles)).toEqual({
      title: "News or blog feed",
      detail: "example.com/feed.xml",
    });
    // No preset title known: the collector's title.
    expect(
      runName(run, [], { presets: new Map(), collectors: titles.collectors }),
    ).toEqual({ title: "Feed items", detail: "example.com/feed.xml" });
  });
});
