import { describe, expect, it } from "vitest";
import {
  extractPlainText,
  estimateReadingTime,
  extractHeadings,
} from "./lexical";

const makeParagraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "text", text }],
});

const makeHeading = (text: string, tag: "h2" | "h3") => ({
  type: "heading",
  tag,
  children: [{ type: "text", text }],
});

const wrapInRoot = (children: unknown[]) => ({
  root: { children },
});

describe("extractPlainText", () => {
  it("joins text nodes with spaces", () => {
    const nodes = [
      { type: "text", text: "Hello" },
      { type: "text", text: "World" },
    ];
    expect(extractPlainText(nodes)).toBe("Hello World");
  });

  it("normalizes whitespace", () => {
    const nodes = [{ type: "text", text: "Hello   World" }];
    expect(extractPlainText(nodes)).toBe("Hello World");
  });

  it("extracts text from nested children", () => {
    const nodes = [
      {
        type: "paragraph",
        children: [{ type: "text", text: "Nested text" }],
      },
    ];
    expect(extractPlainText(nodes)).toBe("Nested text");
  });
});

describe("estimateReadingTime", () => {
  it("returns 1 for short content", () => {
    const content = wrapInRoot([makeParagraph("Hello world")]);
    expect(estimateReadingTime(content)).toBe(1);
  });

  it("calculates reading time at 200 WPM", () => {
    const words = Array(400).fill("word").join(" ");
    const content = wrapInRoot([makeParagraph(words)]);
    expect(estimateReadingTime(content)).toBe(2);
  });

  it("rounds up", () => {
    const words = Array(201).fill("word").join(" ");
    const content = wrapInRoot([makeParagraph(words)]);
    expect(estimateReadingTime(content)).toBe(2);
  });

  it("returns 1 for empty content", () => {
    expect(estimateReadingTime(null)).toBe(1);
    expect(estimateReadingTime({})).toBe(1);
  });
});

describe("extractHeadings", () => {
  it("extracts h2 and h3 headings with slugs", () => {
    const content = wrapInRoot([
      makeHeading("Introduction", "h2"),
      makeParagraph("Some text"),
      makeHeading("Getting Started", "h3"),
    ]);
    expect(extractHeadings(content)).toEqual([
      { text: "Introduction", slug: "introduction", level: 2 },
      { text: "Getting Started", slug: "getting-started", level: 3 },
    ]);
  });

  it("deduplicates slugs", () => {
    const content = wrapInRoot([
      makeHeading("Setup", "h2"),
      makeHeading("Setup", "h2"),
      makeHeading("Setup", "h2"),
    ]);
    const headings = extractHeadings(content);
    expect(headings[0]!.slug).toBe("setup");
    expect(headings[1]!.slug).toBe("setup-1");
    expect(headings[2]!.slug).toBe("setup-2");
  });

  it("returns empty array for no headings", () => {
    const content = wrapInRoot([makeParagraph("Just text")]);
    expect(extractHeadings(content)).toEqual([]);
  });

  it("returns empty array for null content", () => {
    expect(extractHeadings(null)).toEqual([]);
  });
});
