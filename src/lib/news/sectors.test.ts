import { describe, expect, it } from "vitest";

import { NEWS_FEEDS } from "@/server/news/feeds";

import {
  DEFAULT_NEWS_SECTOR,
  NEWS_SECTORS,
  catalogHasRealFeeds,
  newsSectorCanonicalPath,
  newsSectorOrDefault,
  newsSectorViewRobots,
  parseNewsSector,
} from "./sectors";

describe("news sectors", () => {
  it("defaults existing communities to AI and keeps AI as one choice", () => {
    expect(DEFAULT_NEWS_SECTOR).toBe("ai");
    expect(NEWS_SECTORS).toContain("ai");
    expect(newsSectorOrDefault(null)).toBe("ai");
    expect(newsSectorOrDefault("")).toBe("ai");
    expect(newsSectorOrDefault("nope")).toBe("ai");
  });

  it("accepts the sector list and a hyphenated slug", () => {
    expect(parseNewsSector("sports")).toBe("sports");
    expect(parseNewsSector("local-business")).toBe("local_business");
    expect(parseNewsSector([" expat "])).toBe("expat");
    expect(parseNewsSector("finance")).toBeNull();
  });

  it("has real catalog feeds for AI only", () => {
    expect(NEWS_FEEDS.length).toBeGreaterThan(0);
    expect(catalogHasRealFeeds("ai")).toBe(true);
    for (const sector of NEWS_SECTORS) {
      if (sector === "ai") continue;
      expect(catalogHasRealFeeds(sector)).toBe(false);
    }
  });

  it("keeps an empty sector filter noindex and canonical to /news", () => {
    expect(newsSectorViewRobots(false)).toEqual({ index: false, follow: true });
    expect(newsSectorCanonicalPath()).toBe("/news");
  });

  it("uses the news page robots once a sector has real stories", () => {
    expect(newsSectorViewRobots(true)).toEqual({ index: false, follow: true });
  });
});
