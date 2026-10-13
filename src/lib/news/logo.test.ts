import { describe, expect, it } from "vitest";

import { newsLogoInitial } from "./logo";

describe("newsLogoInitial", () => {
  it("uses one letter from the company or source name", () => {
    expect(newsLogoInitial("MIT Technology Review")).toBe("M");
    expect(newsLogoInitial("  openai")).toBe("O");
    expect(newsLogoInitial("3Blue1Brown")).toBe("3");
  });

  it("has no initial when the name is missing or only punctuation", () => {
    expect(newsLogoInitial("")).toBeNull();
    expect(newsLogoInitial("   ")).toBeNull();
    expect(newsLogoInitial(null)).toBeNull();
    expect(newsLogoInitial("—")).toBeNull();
  });
});
