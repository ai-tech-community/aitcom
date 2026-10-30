import { describe, expect, it } from "vitest";

import {
  hasInlineMarkdown,
  parseInlineMarkdown,
  planPaste,
} from "./inline-markdown";

describe("parseInlineMarkdown", () => {
  it("turns a markdown link and emphasis into a link and marks", () => {
    expect(
      parseInlineMarkdown(
        "Watch [Is het slecht om niet te ontbijten?](https://schooltv.nl/video-item/is-het-slecht-om-niet-te-ontbijten-victorias-factcheck) on Schooltv. Listen for the words *ontbijt* and *eten*.",
      ),
    ).toEqual([
      { kind: "text", text: "Watch ", format: 0 },
      {
        kind: "link",
        text: "Is het slecht om niet te ontbijten?",
        url: "https://schooltv.nl/video-item/is-het-slecht-om-niet-te-ontbijten-victorias-factcheck",
      },
      {
        kind: "text",
        text: " on Schooltv. Listen for the words ",
        format: 0,
      },
      { kind: "text", text: "ontbijt", format: 2 },
      { kind: "text", text: " and ", format: 0 },
      { kind: "text", text: "eten", format: 2 },
      { kind: "text", text: ".", format: 0 },
    ]);
  });

  it("keeps bold and underscore emphasis", () => {
    expect(parseInlineMarkdown("A **bold** and _italic_ word.")).toEqual([
      { kind: "text", text: "A ", format: 0 },
      { kind: "text", text: "bold", format: 1 },
      { kind: "text", text: " and ", format: 0 },
      { kind: "text", text: "italic", format: 2 },
      { kind: "text", text: " word.", format: 0 },
    ]);
  });

  it("leaves plain sentences and multiplication alone", () => {
    expect(parseInlineMarkdown("Sam is zeven jaar. 2*3*4")).toEqual([
      { kind: "text", text: "Sam is zeven jaar. 2*3*4", format: 0 },
    ]);
    expect(hasInlineMarkdown("Sam is zeven jaar.")).toBe(false);
  });

  it("does not make a javascript target a link", () => {
    const source = "[click](javascript:alert(1))";
    expect(parseInlineMarkdown(source)).toEqual([
      { kind: "text", text: source, format: 0 },
    ]);
  });
});

describe("planPaste", () => {
  it("plans a lone video URL as a video block, including a generic page", () => {
    expect(planPaste("https://youtu.be/dQw4w9WgXcQ\n")).toEqual({
      kind: "video",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    expect(planPaste("https://example.com/story")).toEqual({
      kind: "video",
      url: "https://example.com/story",
    });
  });

  it("plans markdown as marks and leaves ordinary text to the editor", () => {
    expect(planPaste("Listen for *ontbijt*.")).toMatchObject({
      kind: "markdown",
    });
    expect(planPaste("Sam eats breakfast.")).toEqual({ kind: "default" });
  });
});
