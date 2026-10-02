// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { BADGE_SLUGS } from "@/lib/badges/catalog";
import {
  clearBadgeRarityCache,
  optionalBadgeRarity,
  toBadgeRarityReport,
} from "@/server/badges/rarity";

describe("toBadgeRarityReport", () => {
  it("lists every catalog badge, shares for most, counts for editions", () => {
    const report = toBadgeRarityReport(
      200,
      new Map([
        ["first_event", 50],
        ["early_adopter", 100],
        ["not_in_catalog", 7],
      ]),
    );
    expect(report.members).toBe(200);
    expect(report.badges.map((badge) => badge.slug)).toEqual(BADGE_SLUGS);
    const of = (slug: string) =>
      report.badges.find((badge) => badge.slug === slug);
    expect(of("first_event")).toEqual({
      slug: "first_event",
      measure: "share",
      holders: 50,
      share: 0.25,
    });
    expect(of("veteran")).toEqual({
      slug: "veteran",
      measure: "share",
      holders: 0,
      share: 0,
    });
    expect(of("early_adopter")).toEqual({
      slug: "early_adopter",
      measure: "count",
      holders: 100,
      editionSize: 100,
    });
  });

  it("has no share when there are no members", () => {
    const report = toBadgeRarityReport(0, new Map());
    expect(
      report.badges.every(
        (badge) => badge.measure === "count" || badge.share === 0,
      ),
    ).toBe(true);
  });
});

describe("optionalBadgeRarity", () => {
  it("logs a failed load and yields null instead of failing the page", async () => {
    clearBadgeRarityCache();
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const db = {
      execute: () => Promise.reject(new Error("db down")),
    } as never;
    await expect(optionalBadgeRarity(db)).resolves.toBeNull();
    expect(error).toHaveBeenCalledWith(
      "badges: rarity failed to load",
      expect.any(Error),
    );
    error.mockRestore();
    clearBadgeRarityCache();
  });
});
