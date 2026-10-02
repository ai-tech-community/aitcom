// @vitest-environment node
import { describe, expect, it } from "vitest";

import { DISPLAYABLE_BADGE_SLUGS } from "@/lib/gamification";
import en from "../../messages/en.json";
import nl from "../../messages/nl.json";

describe("badge names", () => {
  it.each([
    ["en", en.badges],
    ["nl", nl.badges],
  ])("every catalog badge has a %s name", (_locale, names) => {
    const missing = DISPLAYABLE_BADGE_SLUGS.filter(
      (slug) =>
        typeof (names as Record<string, unknown>)[slug] !== "string" ||
        ((names as Record<string, string>)[slug] ?? "").trim() === "",
    );
    expect(missing).toEqual([]);
  });
});
