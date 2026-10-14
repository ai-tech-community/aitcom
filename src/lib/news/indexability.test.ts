import { describe, expect, it } from "vitest";

import {
  badgeShareRobots,
  isUnlistedNewsGamePath,
  newsGameRobots,
} from "./indexability";

describe("news game indexability", () => {
  it("keeps the weekly board, a claim, and a week url out of the sitemap", () => {
    expect(newsGameRobots()).toEqual({ index: false, follow: true });
    expect(isUnlistedNewsGamePath("https://www.aitcommunity.org/en/news")).toBe(
      true,
    );
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/nl/news/stories/contribute",
      ),
    ).toBe(true);
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/en/news/stories/claim/eu-ai-act",
      ),
    ).toBe(true);
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/en/news/stories/drafts",
      ),
    ).toBe(true);
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/nl/news/stories/drafts/f79b8204-0a7a-485a-82c9-a2a072034eab",
      ),
    ).toBe(true);
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/en/news?week=2026-10-12",
      ),
    ).toBe(true);
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/en/blog/news-roundup",
      ),
    ).toBe(false);
    expect(
      isUnlistedNewsGamePath("https://www.aitcommunity.org/en/members"),
    ).toBe(false);
  });

  it("noindexes a news contribution badge and leaves other public badges alone", () => {
    expect(badgeShareRobots("news_first_scoop", true)).toEqual({
      index: false,
      follow: true,
    });
    expect(badgeShareRobots("news_region_asia", false)).toEqual({
      index: false,
      follow: false,
    });
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/en/members/ada/badges/news_five_stories",
      ),
    ).toBe(true);
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/en/members/ada/badges/news_region_eu/image",
      ),
    ).toBe(true);
    expect(badgeShareRobots("article_author", true)).toBeUndefined();
    expect(badgeShareRobots("article_author", false)).toEqual({
      index: false,
      follow: false,
    });
    expect(
      isUnlistedNewsGamePath(
        "https://www.aitcommunity.org/en/members/ada/badges/article_author",
      ),
    ).toBe(false);
  });
});
