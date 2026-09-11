import { describe, expect, it } from "vitest";

import { HUB_SLUG } from "./hub";
import {
  forumThreadCommunityWhere,
  forumThreadMatchesCommunity,
  forumThreadSitemapPath,
} from "./forum-scope";

const HUB = { id: "hub-ait-id", slug: HUB_SLUG };
const NETHERLANDS = {
  id: "nl-community-id",
  slug: "ait-community-netherlands",
};

describe("forumThreadMatchesCommunity", () => {
  it("treats unscoped threads as Hub threads", () => {
    expect(forumThreadMatchesCommunity(null, HUB)).toBe(true);
    expect(forumThreadMatchesCommunity(undefined, HUB)).toBe(true);
  });

  it("matches Hub-owned threads on the Hub forum", () => {
    expect(forumThreadMatchesCommunity(HUB.id, HUB)).toBe(true);
  });

  it("does not show a tenant thread on the Hub forum", () => {
    expect(forumThreadMatchesCommunity(NETHERLANDS.id, HUB)).toBe(false);
  });

  it("does not show unscoped or Hub threads on a tenant forum", () => {
    expect(forumThreadMatchesCommunity(null, NETHERLANDS)).toBe(false);
    expect(forumThreadMatchesCommunity(HUB.id, NETHERLANDS)).toBe(false);
  });

  it("matches a tenant thread only on that tenant", () => {
    expect(forumThreadMatchesCommunity(NETHERLANDS.id, NETHERLANDS)).toBe(true);
  });
});

describe("forumThreadCommunityWhere", () => {
  it("includes Hub id and null communityId for the Hub", () => {
    expect(forumThreadCommunityWhere(HUB)).toEqual({
      or: [
        { communityId: { equals: HUB.id } },
        { communityId: { exists: false } },
      ],
    });
  });

  it("scopes a tenant forum to that community id only", () => {
    expect(forumThreadCommunityWhere(NETHERLANDS)).toEqual({
      communityId: { equals: NETHERLANDS.id },
    });
  });
});

describe("forumThreadSitemapPath", () => {
  const slugs = new Map([
    [HUB.id, HUB.slug],
    [NETHERLANDS.id, NETHERLANDS.slug],
  ]);

  it("puts unscoped Hub seeds on /communities/ait/forum/{slug}", () => {
    expect(
      forumThreadSitemapPath(
        { slug: "welcome-start-here-hub-join-guides-1788790840883" },
        slugs,
      ),
    ).toBe(
      "/communities/ait/forum/welcome-start-here-hub-join-guides-1788790840883",
    );
  });

  it("does not emit the pre-multitenancy /community/{slug} path", () => {
    const path = forumThreadSitemapPath(
      { slug: "this-week-on-ait-one-challenge-one-intro-1786998220592" },
      slugs,
    );
    expect(path).not.toMatch(/^\/community\//);
    expect(path).toBe(
      "/communities/ait/forum/this-week-on-ait-one-challenge-one-intro-1786998220592",
    );
  });

  it("uses the tenant slug when communityId resolves", () => {
    expect(
      forumThreadSitemapPath(
        { slug: "tesst-1780215061668", communityId: NETHERLANDS.id },
        slugs,
      ),
    ).toBe("/communities/ait-community-netherlands/forum/tesst-1780215061668");
  });

  it("falls back to the Hub forum when communityId is unresolved", () => {
    expect(
      forumThreadSitemapPath(
        {
          slug: "welcome-start-here-hub-join-guides-1788790840883",
          communityId: "missing",
        },
        new Map(),
      ),
    ).toBe(
      "/communities/ait/forum/welcome-start-here-hub-join-guides-1788790840883",
    );
  });

  it("returns null when the thread has no slug", () => {
    expect(forumThreadSitemapPath({ slug: null }, slugs)).toBeNull();
    expect(forumThreadSitemapPath({}, slugs)).toBeNull();
  });
});
