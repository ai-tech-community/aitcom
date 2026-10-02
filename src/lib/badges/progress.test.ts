import { describe, expect, it } from "vitest";

import { tierFraction, toTrackProgress } from "./progress";

describe("toTrackProgress", () => {
  it("names the lowest tier the metric has not reached", () => {
    expect(toTrackProgress("writer", 3)).toEqual({
      track: "writer",
      current: 3,
      next: { tier: 2, slug: "prolific_writer", threshold: 5 },
    });
    expect(toTrackProgress("writer", 0).next?.slug).toBe("article_author");
  });

  it("has no next tier past tier III", () => {
    expect(toTrackProgress("streak", 365).next).toBeNull();
  });
});

describe("tierFraction", () => {
  it("is clamped to 0–1", () => {
    expect(tierFraction(3, 15)).toBeCloseTo(0.2);
    expect(tierFraction(20, 15)).toBe(1);
    expect(tierFraction(-1, 15)).toBe(0);
  });
});
