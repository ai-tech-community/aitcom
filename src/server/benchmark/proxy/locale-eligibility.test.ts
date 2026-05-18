import { describe, expect, it } from "vitest";

import {
  surfaceAllowsLocale,
  surfacesForLocale,
} from "./locale-eligibility";

describe("surfaceAllowsLocale", () => {
  it("allows configured locales", () => {
    expect(surfaceAllowsLocale("chatgpt_grounded", "en-US")).toBe(true);
    expect(surfaceAllowsLocale("chatgpt_grounded", "de-DE")).toBe(true);
  });

  it("rejects locales outside a surface's set", () => {
    expect(surfaceAllowsLocale("chatgpt_grounded", "zh-CN")).toBe(false);
  });

  it("rejects everything for a surface with no entry", () => {
    expect(surfaceAllowsLocale("kimi_grounded", "en-US")).toBe(false);
  });
});

describe("surfacesForLocale", () => {
  it("returns only the surfaces whose set contains the locale", () => {
    expect(
      surfacesForLocale(
        ["chatgpt_grounded", "claude_grounded", "kimi_grounded"],
        "en-US",
      ),
    ).toEqual(["chatgpt_grounded", "claude_grounded"]);
  });

  it("returns empty when no candidate accepts the locale", () => {
    expect(surfacesForLocale(["chatgpt_grounded"], "zh-CN")).toEqual([]);
  });
});
