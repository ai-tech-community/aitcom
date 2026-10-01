import { describe, expect, it } from "vitest";

import { firstLink } from "./links";
import {
  parseInline,
  parsePostText,
  plainPostText,
  toggleList,
  toggleWrap,
} from "./post-format";

describe("parseInline", () => {
  it("reads bold, both italics, and one level of each inside the other", () => {
    expect(parseInline("Ship **fast** and _well_ and *now*")).toEqual([
      { text: "Ship " },
      { text: "fast", bold: true },
      { text: " and " },
      { text: "well", italic: true },
      { text: " and " },
      { text: "now", italic: true },
    ]);
    expect(parseInline("**really _very_ good**")).toEqual([
      { text: "really ", bold: true },
      { text: "very", bold: true, italic: true },
      { text: " good", bold: true },
    ]);
    expect(parseInline("_it **b** x_")).toEqual([
      { text: "it ", italic: true },
      { text: "b", italic: true, bold: true },
      { text: " x", italic: true },
    ]);
  });

  it("leaves snake_case, maths, loose marks and links alone", () => {
    for (const plain of [
      "use snake_case_names here",
      "see https://x.test/a_b_c and file_name.txt",
      "follow https://x.com/_jane_ now",
      "https://example.com/docs/_internal_/page",
      "x**2 + y**2",
      "2 ** 3 and a _ b and a * b",
      "** not bold **",
    ]) {
      expect(
        parseInline(plain)
          .map((p) => p.text)
          .join(""),
      ).toBe(plain);
      expect(parseInline(plain).some((p) => p.bold ?? p.italic)).toBe(false);
    }
  });

  it("can make a whole link bold, and the link stays whole", () => {
    expect(parseInline("See **https://x.com/a_b** now")).toEqual([
      { text: "See " },
      { text: "https://x.com/a_b", bold: true },
      { text: " now" },
    ]);
    // The preview finds the same link, without the marks.
    expect(firstLink("See **https://x.com/a** now")).toBe("https://x.com/a");
    expect(firstLink("See _https://x.com/a_ now")).toBe("https://x.com/a");
  });
});

describe("parsePostText", () => {
  it("groups lines into paragraphs and lists, without a doubled gap after a list", () => {
    expect(
      parsePostText("Agenda:\n- talks\n- **pizza**\n\n1. arrive\n2. build"),
    ).toEqual([
      { kind: "text", lines: [[{ text: "Agenda:" }]] },
      {
        kind: "bullets",
        items: [[{ text: "talks" }], [{ text: "pizza", bold: true }]],
      },
      {
        kind: "numbers",
        start: 1,
        items: [[{ text: "arrive" }], [{ text: "build" }]],
      },
    ]);
  });

  it("gives plain text without the marks", () => {
    expect(plainPostText("**Big** _news_\n- *one*")).toBe("Big news\n- one");
  });
});

describe("toggleWrap", () => {
  it("wraps the selection, and unwraps it again", () => {
    const wrapped = toggleWrap("make this bold", 5, 9, "**");
    expect(wrapped).toEqual({ value: "make **this** bold", start: 7, end: 11 });
    expect(toggleWrap(wrapped.value, wrapped.start, wrapped.end, "**")).toEqual(
      { value: "make this bold", start: 5, end: 9 },
    );
  });

  it("unwraps when the marks are selected too, or the caret is in the word", () => {
    expect(toggleWrap("a **word** b", 2, 10, "**").value).toBe("a word b");
    expect(toggleWrap("a **word** b", 6, 6, "**").value).toBe("a word b");
  });

  it("keeps edge spaces outside and grows a part of a word to the word", () => {
    expect(toggleWrap("Hello world ", 6, 12, "**").value).toBe(
      "Hello **world** ",
    );
    expect(toggleWrap("snakecase", 0, 5, "_").value).toBe("_snakecase_");
  });

  it("marks each line of a selection over several lines", () => {
    expect(toggleWrap("one\n\ntwo", 0, 8, "**").value).toBe(
      "**one**\n\n**two**",
    );
  });

  it("marks the word the caret is in, or places a pair outside words", () => {
    expect(toggleWrap("a word b", 4, 4, "_").value).toBe("a _word_ b");
    expect(toggleWrap("a  b", 2, 2, "_")).toEqual({
      value: "a __ b",
      start: 3,
      end: 3,
    });
  });
});

describe("toggleList", () => {
  it("turns the touched lines into a list, and back", () => {
    const text = "intro\none\ntwo\noutro";
    const listed = toggleList(text, 7, 12, "numbers");
    expect(listed.value).toBe("intro\n1. one\n2. two\noutro");
    expect(
      toggleList(listed.value, listed.start, listed.end, "numbers").value,
    ).toBe(text);
    expect(
      toggleList(listed.value, listed.start, listed.end, "bullets").value,
    ).toBe("intro\n- one\n- two\noutro");
  });

  it("leaves empty lines empty and the line after a selection alone", () => {
    expect(toggleList("a\n\nb", 0, 4, "bullets").value).toBe("- a\n\n- b");
    expect(toggleList("a\nb\nc", 0, 4, "bullets").value).toBe("- a\n- b\nc");
    expect(toggleList("\nabc", 0, 0, "bullets").value).toBe("\nabc");
  });
});
