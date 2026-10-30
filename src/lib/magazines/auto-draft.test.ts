import { describe, expect, it } from "vitest";

import {
  AUTO_DRAFT_SOURCES,
  AUTO_DRAFT_SOURCE_DEFAULTS,
  AUTO_DRAFT_SOURCE_ORDER,
  DEFAULT_AUTO_DRAFT_SETTINGS,
  autoDraftSettingsInput,
  resolveSources,
  sourceMaxLimit,
} from "./auto-draft";

describe("automatic draft settings", () => {
  it("lists every source once, in draft order", () => {
    expect(AUTO_DRAFT_SOURCE_ORDER).toEqual([
      "article",
      "storyline",
      "event",
      "forumThread",
      "launchpadProject",
      "newsItem",
      "welcome",
    ]);
    expect([...AUTO_DRAFT_SOURCE_ORDER].sort()).toEqual(
      Object.keys(AUTO_DRAFT_SOURCES).sort(),
    );
    expect([...AUTO_DRAFT_SOURCE_ORDER].sort()).toEqual(
      Object.keys(AUTO_DRAFT_SOURCE_DEFAULTS).sort(),
    );
    expect(AUTO_DRAFT_SOURCE_ORDER).toHaveLength(7);
    expect(new Set(AUTO_DRAFT_SOURCE_ORDER).size).toBe(7);
  });

  it("only the welcome counts nothing toward the minimum and allows one block", () => {
    for (const source of AUTO_DRAFT_SOURCE_ORDER) {
      expect(AUTO_DRAFT_SOURCES[source].countsTowardMinimum).toBe(
        source !== "welcome",
      );
      expect(sourceMaxLimit(source)).toBe(source === "welcome" ? 1 : 10);
      expect(AUTO_DRAFT_SOURCES[source].needsTopics).toBe(
        source === "storyline" || source === "newsItem",
      );
    }
  });

  it("fills missing sources with defaults and clamps counts", () => {
    const sources = resolveSources({
      article: { enabled: false, max: 50 },
      welcome: { enabled: true, max: 4 },
      editorial: { enabled: false, max: 1 },
      poll: { enabled: true, max: 2 },
    });
    expect(sources.article).toEqual({ enabled: false, max: 10 });
    expect(sources.welcome).toEqual({ enabled: true, max: 1 });
    expect(sources.storyline).toEqual(AUTO_DRAFT_SOURCE_DEFAULTS.storyline);
    expect(sources).not.toHaveProperty("editorial");
    expect(sources).not.toHaveProperty("poll");
    expect(resolveSources("junk")).toEqual(AUTO_DRAFT_SOURCE_DEFAULTS);
    expect(
      resolveSources({ article: { enabled: false, max: -3 } }).article,
    ).toEqual({ enabled: false, max: 1 });
    expect(
      resolveSources({ article: { enabled: "no", max: 2 } }).article,
    ).toEqual(AUTO_DRAFT_SOURCE_DEFAULTS.article);
  });

  it("protects defaults from shared mutation and resolves fresh source records", () => {
    expect(Object.isFrozen(DEFAULT_AUTO_DRAFT_SETTINGS.sources)).toBe(true);
    for (const source of AUTO_DRAFT_SOURCE_ORDER)
      expect(Object.isFrozen(DEFAULT_AUTO_DRAFT_SETTINGS.sources[source])).toBe(
        true,
      );
    const first = resolveSources(null);
    const second = resolveSources(null);
    first.article.enabled = false;
    expect(second.article.enabled).toBe(true);
    expect(DEFAULT_AUTO_DRAFT_SETTINGS.sources.article.enabled).toBe(true);
  });

  it("refuses settings out of bounds", () => {
    const { publicConfirmedBy, publicConfirmedAt, ...settings } =
      DEFAULT_AUTO_DRAFT_SETTINGS;
    expect(publicConfirmedBy).toBeNull();
    expect(publicConfirmedAt).toBeNull();
    expect(autoDraftSettingsInput.safeParse(settings).success).toBe(true);
    for (const invalid of [
      { monthDay: 29 },
      { weekday: 0 },
      { autoPublishDays: 15 },
      { sources: { forumThread: { enabled: true, max: 0 } } },
      { sources: { welcome: { enabled: true, max: 2 } } },
    ]) {
      expect(
        autoDraftSettingsInput.safeParse({ ...settings, ...invalid }).success,
      ).toBe(false);
    }
    expect(
      autoDraftSettingsInput.safeParse({
        ...settings,
        sources: {},
        confirmUnlistedPublic: true,
      }).success,
    ).toBe(true);
  });
});
