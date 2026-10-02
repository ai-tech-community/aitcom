// @vitest-environment node
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";

import { BADGE_CATALOG, BADGE_TRACK_IDS } from "@/lib/badges/catalog";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

/** The message at a dotted path inside the `badges` namespace, if a string. */
function messageAt(badges: unknown, key: string): string | null {
  const value = key
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" && Object.hasOwn(node, part)
          ? (node as Record<string, unknown>)[part]
          : undefined,
      badges,
    );
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

describe.each([
  ["en", en],
  ["nl", nl],
] as const)("badge messages (%s)", (locale, messages) => {
  it("names every catalog badge", () => {
    const missing = BADGE_CATALOG.filter(
      (badge) => messageAt(messages.badges, badge.nameKey) === null,
    ).map((badge) => badge.slug);
    expect(missing).toEqual([]);
  });

  it("describes every catalog badge, with its threshold", () => {
    const t = createTranslator({
      locale: locale as string,
      messages: messages as never,
      namespace: "badges" as never,
    });
    for (const badge of BADGE_CATALOG) {
      expect(
        messageAt(messages.badges, badge.descriptionKey),
        badge.slug,
      ).not.toBeNull();
      const text = (t as (k: string, v?: object) => string)(
        badge.descriptionKey,
        badge.descriptionValues,
      );
      if (badge.descriptionValues) {
        expect(text, badge.slug).toContain(
          String(badge.descriptionValues.count),
        );
      }
    }
  });

  it("names every track", () => {
    const missing = BADGE_TRACK_IDS.filter(
      (track) => messageAt(messages.badges, `tracks.${track}`) === null,
    );
    expect(missing).toEqual([]);
  });

  it("has no message for a badge outside the catalog", () => {
    const slugs = new Set(BADGE_CATALOG.map((badge) => badge.slug));
    expect(
      Object.keys(messages.badges.names).filter(
        (slug) => !slugs.has(slug as never),
      ),
    ).toEqual([]);
  });
});
