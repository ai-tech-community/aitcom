import { describe, expect, it } from "vitest";

import { cutWords, openingOf, TEASER_OPENING_WORDS } from "./teaser";

const text = (type: string, value: string) => ({
  type,
  children: [{ type: "text", text: value }],
});
const state = (...children: unknown[]) => ({ root: { children } });
const words = (count: number) =>
  Array.from({ length: count }, (_, i) => `word${i + 1}`).join(" ");

describe("article openings", () => {
  it("takes text blocks in order and stops at 80 words", () => {
    expect(TEASER_OPENING_WORDS).toBe(80);
    expect(
      openingOf(
        state(
          text("heading", "Heading"),
          text("paragraph", "A paragraph"),
          text("quote", "A quote"),
          {
            type: "list",
            children: [
              {
                type: "listitem",
                children: [{ type: "text", text: "A list" }],
              },
            ],
          },
        ),
      ),
    ).toBe("Heading A paragraph A quote A list");
    expect(
      openingOf(state(text("paragraph", words(70)), text("quote", words(20)))),
    ).toBe(`${words(70)} ${words(10)}…`);
  });

  it("skips code, images and embeds, also when they come first", () => {
    for (const code of [
      { type: "block", fields: { blockType: "Code", code: words(50) } },
      text("code", words(50)),
    ]) {
      expect(
        openingOf(
          state(
            code,
            text("image", "image-secret"),
            text("embed", "embed-secret"),
            text("horizontalrule", "rule-secret"),
            text(
              "paragraph",
              "One two three four five six seven eight nine ten",
            ),
          ),
        ),
      ).toBe("One two three four five six seven eight nine ten");
    }
  });

  it("the 40-word excerpt follows the same rule", () => {
    expect(
      openingOf(
        state(
          text("code", "CODE_MARKER ".repeat(50)),
          text("paragraph", words(60)),
        ),
        40,
      ),
    ).toBe(`${words(40)}…`);
  });

  it("cuts a long first paragraph at 80 words with an ellipsis", () => {
    expect(openingOf(state(text("paragraph", words(100))))).toBe(
      `${words(80)}…`,
    );
  });

  it("is empty for content without text or for malformed content", () => {
    for (const value of [
      null,
      undefined,
      "text",
      {},
      { root: null },
      { root: { children: "bad" } },
      state(null, 3, {}, { type: "paragraph", children: "bad" }),
      state({ type: "image" }),
    ]) {
      expect(openingOf(value)).toBe("");
    }
  });

  it("keeps the existing word-cutting behaviour", () => {
    expect(cutWords("  one  two\nthree ", 2)).toBe("one two…");
    expect(cutWords("one two", 2)).toBe("one two");
    expect(cutWords(" ", 80)).toBe("");
  });
});
