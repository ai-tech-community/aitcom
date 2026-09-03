import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import { HUB_SLUG } from "./hub";
import {
  FEATURED_COMMUNITY_SLUGS,
  NEVER_FEATURE_SLUGS,
  pickFeaturedCommunities,
} from "./featured";

const HOME_PAGE = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../app/[locale]/page.tsx",
);

describe("FEATURED_COMMUNITY_SLUGS", () => {
  it("is exactly the three Pulse doors, in order", () => {
    expect(FEATURED_COMMUNITY_SLUGS).toEqual([
      "ait-community-netherlands",
      "xxx-ai",
      HUB_SLUG,
    ]);
  });

  it("never includes Demo, Tester, or MLOps Amsterdam", () => {
    expect(FEATURED_COMMUNITY_SLUGS).toHaveLength(3);
    for (const killed of NEVER_FEATURE_SLUGS) {
      expect(FEATURED_COMMUNITY_SLUGS).not.toContain(killed);
    }
  });
});

describe("pickFeaturedCommunities", () => {
  const rows = [
    { slug: "demo", name: "Demo" },
    { slug: "ait", name: "AIT Community" },
    { slug: "tester", name: "Tester" },
    { slug: "xxx-ai", name: "xxx.AI" },
    { slug: "mlops-amsterdam", name: "MLOps Amsterdam" },
    { slug: "ait-community-netherlands", name: "AIT Community Netherlands" },
  ];

  it("returns live rows in featured order and drops kill-list slugs", () => {
    expect(pickFeaturedCommunities(rows).map((r) => r.slug)).toEqual([
      "ait-community-netherlands",
      "xxx-ai",
      "ait",
    ]);
  });

  it("omits a featured slug when it is missing from live data", () => {
    expect(
      pickFeaturedCommunities([
        { slug: "xxx-ai", name: "xxx.AI" },
        { slug: "demo", name: "Demo" },
      ]).map((r) => r.slug),
    ).toEqual(["xxx-ai"]);
  });
});

describe("featuredCommunities i18n", () => {
  it("has a kicker and member label in EN and NL", () => {
    for (const m of [en, nl]) {
      expect(m.featuredCommunities.title.trim().length).toBeGreaterThan(0);
      expect(m.featuredCommunities.membersCount).toContain("{count");
      expect(m.featuredCommunities.viewAll.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("homepage wiring", () => {
  it("mounts the featured strip from live featured data", () => {
    const src = readFileSync(HOME_PAGE, "utf8");
    expect(src).toContain("loadFeaturedCommunities");
    expect(src).toContain("FeaturedCommunities");
  });
});
