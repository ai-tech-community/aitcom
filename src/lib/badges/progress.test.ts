import { describe, expect, it } from "vitest";

import { tierFraction, toTrackProgress } from "./progress";

describe("toTrackProgress", () => {
  it("carries only the track and its metric", () => {
    expect(toTrackProgress("writer", 3)).toEqual({
      track: "writer",
      current: 3,
    });
  });
});

describe("tierFraction", () => {
  it("is clamped to 0–1", () => {
    expect(tierFraction(3, 15)).toBeCloseTo(0.2);
    expect(tierFraction(20, 15)).toBe(1);
    expect(tierFraction(-1, 15)).toBe(0);
  });
});
