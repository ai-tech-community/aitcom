import { describe, expect, it } from "vitest";
import { slugify } from "./text-utils";

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
