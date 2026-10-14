import { describe, expect, it } from "vitest";

import {
  normalizeStorySuggestion,
  STORY_SUGGESTION_LIMIT,
  submitStorySuggestion,
  suggestionRateDecision,
} from "./story-suggestion";

describe("normalizeStorySuggestion", () => {
  it("accepts an https source link and a story without one", () => {
    expect(normalizeStorySuggestion("https://example.com/story")).toEqual({
      ok: true,
      value: {
        body: "https://example.com/story",
        url: "https://example.com/story",
      },
    });
    expect(normalizeStorySuggestion("www.example.com/notes")).toEqual({
      ok: true,
      value: {
        body: "https://www.example.com/notes",
        url: "https://www.example.com/notes",
      },
    });
    expect(normalizeStorySuggestion("  Local models in hospitals  ")).toEqual({
      ok: true,
      value: { body: "Local models in hospitals", url: null },
    });
  });

  it("rejects a link that is not https and a story that is too short", () => {
    expect(normalizeStorySuggestion("http://example.com/story")).toEqual({
      ok: false,
      reason: "url",
    });
    expect(normalizeStorySuggestion("nope")).toEqual({
      ok: false,
      reason: "short",
    });
    expect(normalizeStorySuggestion("tiny")).toEqual({
      ok: false,
      reason: "short",
    });
  });
});

describe("submitStorySuggestion", () => {
  it("stops after the daily limit and stores the member's text before that", async () => {
    expect(suggestionRateDecision(STORY_SUGGESTION_LIMIT - 1)).toBe("ok");
    expect(suggestionRateDecision(STORY_SUGGESTION_LIMIT)).toBe("limited");
    const inserted: unknown[] = [];
    const store = {
      countRecent: async () => STORY_SUGGESTION_LIMIT,
      insert: async (row: unknown) => {
        inserted.push(row);
        return "id";
      },
    };
    const limited = await submitStorySuggestion(store, {
      userId: "member",
      value: { body: "A sourced story idea", url: null },
      now: new Date("2026-10-14T12:00:00.000Z"),
    });
    expect(limited).toEqual({ ok: false, reason: "limited" });
    expect(inserted).toEqual([]);

    const saved = await submitStorySuggestion(
      { ...store, countRecent: async () => 0 },
      {
        userId: "member",
        value: {
          body: "https://example.com/a",
          url: "https://example.com/a",
        },
        now: new Date("2026-10-14T12:00:00.000Z"),
      },
    );
    expect(saved).toEqual({ ok: true, id: "id" });
    expect(inserted).toEqual([
      {
        userId: "member",
        body: "https://example.com/a",
        url: "https://example.com/a",
      },
    ]);
  });
});
