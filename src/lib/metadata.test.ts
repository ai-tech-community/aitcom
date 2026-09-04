import { describe, expect, it } from "vitest";

import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

import { buildAlternates } from "./metadata";

/**
 * Mirrors Lighthouse's `canonical` SEO audit: fail when the current page URL
 * and the document canonical are both in the hreflang set but are not the
 * same URL. That is the "points to another hreflang location" failure.
 */
function pointsToAnotherHreflang(
  pageUrl: string,
  alternates: ReturnType<typeof buildAlternates>,
  extraHreflangUrls: string[] = [],
) {
  const hreflangUrls = new Set([
    ...Object.values(alternates.languages),
    ...extraHreflangUrls,
  ]);
  return (
    hreflangUrls.has(pageUrl) &&
    hreflangUrls.has(alternates.canonical) &&
    pageUrl !== alternates.canonical
  );
}

describe("buildAlternates", () => {
  it("uses a self-canonical on the English homepage, not a different hreflang", () => {
    const alternates = buildAlternates("", "en");
    const pageUrl = `${CANONICAL_PRODUCTION_ORIGIN}/en`;

    expect(alternates.canonical).toBe(pageUrl);
    expect(alternates.canonical).toBe(alternates.languages.en);
    expect(alternates.canonical).not.toBe(alternates.languages.nl);
    expect(
      pointsToAnotherHreflang(pageUrl, alternates, [
        `${CANONICAL_PRODUCTION_ORIGIN}/en`,
        `${CANONICAL_PRODUCTION_ORIGIN}/nl`,
      ]),
    ).toBe(false);
  });

  it("uses a self-canonical on the Dutch homepage instead of the English alternate", () => {
    const alternates = buildAlternates("", "nl");
    const pageUrl = `${CANONICAL_PRODUCTION_ORIGIN}/nl`;

    expect(alternates.canonical).toBe(pageUrl);
    expect(alternates.canonical).toBe(alternates.languages.nl);
    expect(alternates.canonical).not.toBe(alternates.languages.en);
    expect(alternates.canonical).not.toBe(alternates.languages["x-default"]);
    expect(
      pointsToAnotherHreflang(pageUrl, alternates, [
        `${CANONICAL_PRODUCTION_ORIGIN}/en`,
        `${CANONICAL_PRODUCTION_ORIGIN}/nl`,
      ]),
    ).toBe(false);
  });

  it("keeps locale routes self-canonical on the preferred www host", () => {
    const en = buildAlternates("/events", "en");
    const nl = buildAlternates("/events", "nl");

    expect(en.canonical).toBe(`${CANONICAL_PRODUCTION_ORIGIN}/en/events`);
    expect(nl.canonical).toBe(`${CANONICAL_PRODUCTION_ORIGIN}/nl/events`);
    expect(en.canonical).toBe(en.languages.en);
    expect(nl.canonical).toBe(nl.languages.nl);
    expect(en.canonical).not.toContain("://aitcommunity.org/");
    expect(nl.canonical).not.toContain("://aitcommunity.org/");
    expect(pointsToAnotherHreflang(en.canonical, en)).toBe(false);
    expect(pointsToAnotherHreflang(nl.canonical, nl)).toBe(false);
  });
});
