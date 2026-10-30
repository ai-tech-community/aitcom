import { describe, expect, it } from "vitest";

import {
  extractPlainText,
  lexicalHasText,
  lexicalPlainText,
} from "./lexical-text";

function state(...paragraphs: string[]) {
  return {
    root: {
      type: "root",
      children: paragraphs.map((text) => ({
        type: "paragraph",
        children: text === "" ? [] : [{ type: "text", text }],
      })),
    },
  };
}

describe("extractPlainText", () => {
  it("joins nested text with single spaces and trims", () => {
    expect(
      extractPlainText([
        { children: [{ text: "  Hello " }, { children: [{ text: "World" }] }] },
      ]),
    ).toBe("Hello World");
  });
});

describe("lexicalPlainText", () => {
  it("reads an editor state's text", () => {
    expect(lexicalPlainText(state("One", "two"))).toBe("One two");
  });

  it("is empty for anything that is not an editor state", () => {
    for (const value of [null, undefined, "text", 3, {}, { root: {} }]) {
      expect(lexicalPlainText(value)).toBe("");
    }
  });
});

describe("lexicalHasText", () => {
  it("is true only when some text is there", () => {
    expect(lexicalHasText(state("Hi"))).toBe(true);
    expect(lexicalHasText(state(""))).toBe(false);
    expect(lexicalHasText(state("   "))).toBe(false);
    expect(lexicalHasText(null)).toBe(false);
  });
});
