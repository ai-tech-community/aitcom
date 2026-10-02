import { describe, expect, it } from "vitest";
import { clipText, oneLine, slugify } from "./text-utils";

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
