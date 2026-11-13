import { describe, expect, it } from "vitest";
import {
  clampText,
  clipText,
  oneLine,
  slugify,
  wellFormed,
} from "./text-utils";

const EMOJI = "\u{1F600}"; // two UTF-16 units
const LONE_HIGH = "\uD83D";
const LONE_LOW = "\uDE00";

/** True when the string survives encodeURIComponent (no lone surrogates). */
function isWellFormed(value: string): boolean {
  try {
    encodeURIComponent(value);
    return true;
  } catch {
    return false;
  }
}

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Getting Started with AI")).toBe("getting-started-with-ai");
  });

  it("strips special characters", () => {
    expect(slugify("API & SDK")).toBe("api-sdk");
  });

  it("handles accented characters via NFD normalization", () => {
    expect(slugify("Über uns")).toBe("uber-uns");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--hello world--")).toBe("hello-world");
  });

  it("truncates to 80 characters", () => {
    const long = "a".repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(80);
  });

  it("returns empty string for empty input", () => {
    expect(slugify("")).toBe("");
  });
});

describe("clipText", () => {
  it("leaves short text alone", () => {
    expect(clipText("Makers", 10)).toBe("Makers");
    expect(clipText("1234567890", 10)).toBe("1234567890");
  });

  it("cuts long text to the limit, ending with an ellipsis", () => {
    const clipped = clipText("a".repeat(300), 255);
    expect(Array.from(clipped)).toHaveLength(255);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("never splits an emoji, and counts it as one character", () => {
    const clipped = clipText("😀".repeat(10), 5);
    expect(clipped).toBe("😀😀😀😀…");
    expect(clipText("😀😀", 2)).toBe("😀😀");
  });

  it("does not leave a space before the ellipsis", () => {
    expect(clipText("one two three", 5)).toBe("one…");
  });
});

describe("oneLine", () => {
  it("flattens newlines and runs of spaces", () => {
    expect(oneLine("  Ada \n\t Lovelace  ")).toBe("Ada Lovelace");
  });
});

describe("wellFormed / clampText", () => {
  it("keeps valid text, including whole emoji, unchanged", () => {
    expect(wellFormed(`Week ${EMOJI} 1`)).toBe(`Week ${EMOJI} 1`);
  });

  it.each([
    [`a${LONE_HIGH}b`, "a\uFFFDb"],
    [`a${LONE_LOW}b`, "a\uFFFDb"],
    [`${LONE_LOW}${LONE_HIGH}`, "\uFFFD\uFFFD"],
    [`end${LONE_HIGH}`, "end\uFFFD"],
  ])("replaces lone surrogates in %j", (input, output) => {
    expect(wellFormed(input)).toBe(output);
  });

  it("cuts to the limit in UTF-16 units without splitting an emoji", () => {
    expect(clampText(`ab${EMOJI}`, 3)).toBe("ab");
    expect(clampText(`ab${EMOJI}`, 4)).toBe(`ab${EMOJI}`);
    expect(clampText("abcdef", 3)).toBe("abc");
  });

  it("cleans lone surrogates before cutting", () => {
    const clamped = clampText(`${"a".repeat(200)}${LONE_HIGH}`, 200 + 1);
    expect(clamped).toBe(`${"a".repeat(200)}\uFFFD`);
    expect(isWellFormed(clamped)).toBe(true);
  });
});
