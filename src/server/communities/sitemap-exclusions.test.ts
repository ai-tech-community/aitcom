import { describe, expect, it } from "vitest";

import {
  docBelongsToHiddenCommunity,
  hiddenCommunitySlugs,
  urlListsHiddenCommunity,
  withoutHiddenCommunityUrls,
} from "./sitemap-exclusions";

const HIDDEN = new Set(["xxx-ai", "demo-community"]);

describe("urlListsHiddenCommunity", () => {
  it("matches the community page and every child, in both locales", () => {
    for (const url of [
      "/communities/xxx-ai",
      "/communities/xxx-ai/forum/what-we-are-planning-for-the-new-community-1778970286390",
      "/communities/demo-community/events/demo-day",
      "/communities/demo-community/classroom/intro",
      "https://www.aitcommunity.org/en/communities/xxx-ai",
      "https://www.aitcommunity.org/nl/communities/demo-community/forum/news-1774515507201",
    ]) {
      expect(urlListsHiddenCommunity(url, HIDDEN)).toBe(true);
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
      expect(urlListsHiddenCommunity(url, HIDDEN)).toBe(false);
    }
  });
});

describe("withoutHiddenCommunityUrls", () => {
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
      HIDDEN,
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
