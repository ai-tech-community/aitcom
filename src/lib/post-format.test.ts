import { describe, expect, it } from "vitest";

import {
  parseInline,
  parsePostText,
  toggleList,
  toggleWrap,
} from "./post-format";

describe("parseInline", () => {
  it("reads bold, italic and italic inside bold", () => {
    expect(parseInline("Ship **fast** and _well_")).toEqual([
      { text: "Ship " },
      { text: "fast", bold: true },
      { text: " and " },
      { text: "well", italic: true },
    ]);
    expect(parseInline("**really _very_ good**")).toEqual([
      { text: "really ", bold: true },
      { text: "very", bold: true, italic: true },
      { text: " good", bold: true },
    ]);
  });

  it("leaves snake_case, links and loose markers alone", () => {
    for (const plain of [
      "use snake_case_names here",
      "see https://x.test/a_b_c and file_name.txt",
      "2 ** 3 and a _ b",
      "** not bold **",
    ]) {
      expect(parseInline(plain)).toEqual([{ text: plain }]);
    }
  });
});

describe("parsePostText", () => {
  it("groups lines into paragraphs and lists", () => {
    expect(
      parsePostText("Agenda:\n- talks\n- **pizza**\n\n1. arrive\n2. build"),
    ).toEqual([
      { kind: "text", lines: [[{ text: "Agenda:" }]] },
      {
        kind: "bullets",
        items: [[{ text: "talks" }], [{ text: "pizza", bold: true }]],
      },
      { kind: "text", lines: [[]] },
      {
        kind: "numbers",
        start: 1,
        items: [[{ text: "arrive" }], [{ text: "build" }]],
      },
    ]);
  });
});

describe("toggleWrap", () => {
  it("wraps the selection, and unwraps it again", () => {
    const wrapped = toggleWrap("make this bold", 5, 9, "**");
    expect(wrapped).toEqual({ value: "make **this** bold", start: 7, end: 11 });
    expect(toggleWrap(wrapped.value, wrapped.start, wrapped.end, "**")).toEqual(
      {
        value: "make this bold",
        start: 5,
        end: 9,
      },
    );
  });

  it("places a pair with the caret between them when nothing is selected", () => {
    expect(toggleWrap("a b", 2, 2, "_")).toEqual({
      value: "a __b",
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
});
