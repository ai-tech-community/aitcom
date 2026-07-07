import { describe, expect, it } from "vitest";

import { AUDIENCE_SEED, WEEKDAY_VALUES } from "./audience-seed";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// The legacy `events.audience` select field's enum values (formerly
// EVENT_AUDIENCE_OPTIONS in event-metadata.ts, removed in G-T3/#202 once the
// field became an `audiences` relationship). Locked here, literally, because
// this is the one place in the codebase that still needs to assert the
// historical invariant: the first six `audiences` seed slugs must exactly
// match what the legacy enum used to allow, in order.
const LEGACY_EVENT_AUDIENCE_VALUES = [
  "engineers",
  "founders",
  "marketers",
  "product",
  "researchers",
  "mixed",
] as const;

describe("AUDIENCE_SEED", () => {
  it("has unique slugs", () => {
    const slugs = AUDIENCE_SEED.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has exactly seven entries", () => {
    expect(AUDIENCE_SEED).toHaveLength(7);
  });

  it("first six slugs exactly equal the legacy EVENT_AUDIENCE_OPTIONS values, in order", () => {
    const firstSix = AUDIENCE_SEED.slice(0, 6).map((a) => a.slug);
    expect(firstSix).toEqual([...LEGACY_EVENT_AUDIENCE_VALUES]);
  });

  it("includes executives as the seventh entry", () => {
    expect(AUDIENCE_SEED[6]?.slug).toBe("executives");
  });

  it("every slot has valid HH:MM start/end with start strictly before end", () => {
    for (const audience of AUDIENCE_SEED) {
      for (const slot of audience.preferredSlots) {
        expect(slot.startTime).toMatch(HHMM);
        expect(slot.endTime).toMatch(HHMM);
        expect(slot.startTime < slot.endTime).toBe(true);
        expect(slot.weekdays.length).toBeGreaterThan(0);
        for (const day of slot.weekdays) {
          expect(WEEKDAY_VALUES).toContain(day);
        }
      }
    }
  });

  it("related links reference existing slugs", () => {
    const slugs = new Set(AUDIENCE_SEED.map((a) => a.slug));
    for (const audience of AUDIENCE_SEED) {
      for (const related of audience.relatedAudiences) {
        expect(slugs.has(related)).toBe(true);
      }
    }
  });

  it("links executives and founders bidirectionally", () => {
    const bySlug = new Map(AUDIENCE_SEED.map((a) => [a.slug, a]));
    expect(bySlug.get("executives")?.relatedAudiences).toContain("founders");
    expect(bySlug.get("founders")?.relatedAudiences).toContain("executives");
  });

  it("names are non-empty and interests default to an empty array unless specified", () => {
    for (const audience of AUDIENCE_SEED) {
      expect(audience.name.length).toBeGreaterThan(0);
      expect(Array.isArray(audience.interests)).toBe(true);
    }
  });
});
