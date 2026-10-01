import { describe, expect, it } from "vitest";

import {
  MAX_POST_MENTIONS,
  mentionQueryAt,
  mentionsIn,
  readMentions,
  splitMentions,
} from "./post-mentions";

const jane = { userId: "u-jane", name: "Jane Doe" };
const janet = { userId: "u-janet", name: "Jane" };

describe("mentionsIn", () => {
  it("keeps only the mentions whose whole name is in the text", () => {
    expect(mentionsIn("Thanks @Jane Doe!", [jane, janet])).toEqual([jane]);
    expect(mentionsIn("Thanks @Jane and @Jane Doe", [jane, janet])).toEqual([
      jane,
      janet,
    ]);
    // A longer name, or an address, is not the mention.
    expect(mentionsIn("Hi @Janetta", [janet])).toEqual([]);
    expect(mentionsIn("mail me@Jane Doe", [jane])).toEqual([]);
    expect(mentionsIn("Jane Doe without the @", [jane])).toEqual([]);
  });

  it("keeps one per member and at most the limit", () => {
    expect(
      mentionsIn("@Jane Doe", [jane, { userId: "u-jane", name: "Jane" }]),
    ).toEqual([jane]);
    const many = Array.from({ length: MAX_POST_MENTIONS + 3 }, (_, i) => ({
      userId: `u${i}`,
      name: `M${i}`,
    }));
    const text = many.map((m) => `@${m.name}`).join(" ");
    expect(mentionsIn(text, many)).toHaveLength(MAX_POST_MENTIONS);
  });
});

describe("splitMentions", () => {
  it("cuts the text at each mention, the longer name winning", () => {
    expect(splitMentions("Hi @Jane Doe and @Jane.", [janet, jane])).toEqual([
      { text: "Hi " },
      { text: "@Jane Doe", mention: jane },
      { text: " and " },
      { text: "@Jane", mention: janet },
      { text: "." },
    ]);
  });

  it("leaves text without known mentions whole", () => {
    expect(splitMentions("Hi @Bob", [jane])).toEqual([{ text: "Hi @Bob" }]);
    expect(splitMentions("no at sign", [jane])).toEqual([
      { text: "no at sign" },
    ]);
  });
});

describe("mentionQueryAt", () => {
  it("finds the @name being typed before the caret", () => {
    expect(mentionQueryAt("Hello @Ja", 9)).toEqual({ start: 6, query: "Ja" });
    expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQueryAt("(@Jane D", 8)).toEqual({
      start: 1,
      query: "Jane D",
    });
  });

  it("ignores addresses, finished lines and a space right after @", () => {
    expect(mentionQueryAt("me@example", 10)).toBeNull();
    expect(mentionQueryAt("@Jane\nnext", 10)).toBeNull();
    expect(mentionQueryAt("@ hello", 7)).toBeNull();
    expect(mentionQueryAt(`@${"x".repeat(31)}`, 32)).toBeNull();
    expect(mentionQueryAt("no mention", 10)).toBeNull();
  });
});

describe("readMentions", () => {
  it("keeps only well-formed entries", () => {
    expect(
      readMentions([
        jane,
        { userId: 5, name: "x" },
        { userId: "u", name: "" },
        null,
        "x",
      ]),
    ).toEqual([jane]);
    expect(readMentions(null)).toEqual([]);
    expect(readMentions({ userId: "u", name: "x" })).toEqual([]);
  });
});
