import { describe, expect, it } from "vitest";

import {
  docBelongsToHiddenCommunity,
  hiddenCommunitySlugs,
  sitemapCommunityRules,
  urlBreaksCommunityRules,
  urlListsCommunityInside,
  withoutHiddenCommunityUrls,
} from "./sitemap-exclusions";

const HIDDEN = new Set(["xxx-ai", "demo-community"]);
const NOTHING = new Set<string>();
const UNLISTED = { frontPage: HIDDEN, inside: HIDDEN };

describe("urlBreaksCommunityRules", () => {
  it("matches an unlisted community's page and every child, in both locales", () => {
    for (const url of [
      "/communities/xxx-ai",
      "/communities/xxx-ai/forum/what-we-are-planning-for-the-new-community-1778970286390",
      "/communities/demo-community/events/demo-day",
      "/communities/demo-community/classroom/intro",
      "https://www.aitcommunity.org/en/communities/xxx-ai",
      "https://www.aitcommunity.org/nl/communities/demo-community/forum/news-1774515507201",
    ]) {
      expect(urlBreaksCommunityRules(url, UNLISTED)).toBe(true);
    }
  });

  it("keeps listed communities, the Hub, events, and a shorter slug", () => {
    for (const url of [
      "/communities/ait",
      "/communities/ait/forum",
      "/communities/ait-community-netherlands/forum/hello",
      "/communities/demo",
      "/events/public-night",
      "https://www.aitcommunity.org/nl/events/nl-meetup",
    ]) {
      expect(urlBreaksCommunityRules(url, UNLISTED)).toBe(false);
    }
  });
});

describe("urlListsCommunityInside", () => {
  it("matches every page below the front page, never the front page", () => {
    const closed = new Set(["closed-circle"]);
    for (const url of [
      "/communities/closed-circle/forum/plans",
      "/communities/closed-circle/members",
      "https://www.aitcommunity.org/nl/communities/closed-circle/gallery",
    ]) {
      expect(urlListsCommunityInside(url, closed)).toBe(true);
    }
    for (const url of [
      "/communities/closed-circle",
      "https://www.aitcommunity.org/en/communities/closed-circle",
      "https://www.aitcommunity.org/en/communities/closed-circle?ref=x",
      "/communities/closed/forum/plans",
      "/communities/closed-circle-two/forum",
    ]) {
      expect(urlListsCommunityInside(url, closed)).toBe(false);
    }
  });
});

describe("sitemapCommunityRules", () => {
  const slugById = new Map([
    ["xxx-id", "xxx-ai"],
    ["closed-id", "closed-circle"],
    ["nl-id", "ait-community-netherlands"],
    ["hub-id", "ait"],
  ]);

  it("hides an unlisted community's front page and inside, a private one's inside only", () => {
    expect(
      sitemapCommunityRules(
        slugById,
        ["xxx-id", "closed-id"],
        new Set(["closed-circle", "ait-community-netherlands", "ait"]),
      ),
    ).toEqual({
      frontPage: new Set(["xxx-ai"]),
      inside: new Set(["xxx-ai", "closed-circle"]),
    });
  });

  it("hides every front page but the Hub's when the directory lookup fails, inside rules unchanged", () => {
    expect(sitemapCommunityRules(slugById, ["xxx-id"], null)).toEqual({
      frontPage: new Set([
        "xxx-ai",
        "closed-circle",
        "ait-community-netherlands",
      ]),
      inside: new Set(["xxx-ai"]),
    });
  });
});

describe("withoutHiddenCommunityUrls", () => {
  it("keeps a listed private community's front page and drops its inside", () => {
    const entry = (path: string) => ({
      url: `https://www.aitcommunity.org/en${path}`,
      alternates: {
        languages: {
          en: `https://www.aitcommunity.org/en${path}`,
          nl: `https://www.aitcommunity.org/nl${path}`,
        },
      },
    });
    const kept = withoutHiddenCommunityUrls(
      [
        entry("/communities/closed-circle"),
        entry("/communities/closed-circle/forum/plans"),
      ],
      { frontPage: NOTHING, inside: new Set(["closed-circle"]) },
    );
    expect(kept.map((e) => e.url)).toEqual([
      "https://www.aitcommunity.org/en/communities/closed-circle",
    ]);
  });

  it("drops a community page and its locale alternates together", () => {
    const kept = withoutHiddenCommunityUrls(
      [
        {
          url: "https://www.aitcommunity.org/en/communities/xxx-ai",
          alternates: {
            languages: {
              en: "https://www.aitcommunity.org/en/communities/xxx-ai",
              nl: "https://www.aitcommunity.org/nl/communities/xxx-ai",
            },
          },
        },
        {
          url: "https://www.aitcommunity.org/en/communities/ait/forum",
          alternates: {
            languages: {
              en: "https://www.aitcommunity.org/en/communities/ait/forum",
              nl: "https://www.aitcommunity.org/nl/communities/ait/forum",
            },
          },
        },
      ],
      UNLISTED,
    );
    expect(kept.map((entry) => entry.url)).toEqual([
      "https://www.aitcommunity.org/en/communities/ait/forum",
    ]);
  });
});

describe("docBelongsToHiddenCommunity", () => {
  it("drops only the hidden community ids", () => {
    expect(docBelongsToHiddenCommunity("xxx-id", ["xxx-id", "demo-id"])).toBe(
      true,
    );
    expect(docBelongsToHiddenCommunity(null, ["xxx-id"])).toBe(false);
    expect(docBelongsToHiddenCommunity("nl-id", ["xxx-id", "demo-id"])).toBe(
      false,
    );
  });

  it("drops every community-scoped doc when visibility is unknown", () => {
    expect(docBelongsToHiddenCommunity("xxx-id", null)).toBe(true);
    expect(docBelongsToHiddenCommunity(null, null)).toBe(false);
  });
});

describe("hiddenCommunitySlugs", () => {
  it("resolves hidden ids and never hides the Hub", () => {
    expect(
      hiddenCommunitySlugs(
        new Map([
          ["xxx-id", "xxx-ai"],
          ["demo-id", "demo-community"],
          ["hub-id", "ait"],
        ]),
        ["xxx-id", "demo-id", "hub-id", "missing"],
      ),
    ).toEqual(new Set(["xxx-ai", "demo-community"]));
  });
});
