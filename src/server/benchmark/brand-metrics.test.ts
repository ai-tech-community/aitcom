import { describe, expect, it } from "vitest";
import {
  computeAveragePosition,
  computeCitationRate,
  computeShareOfVoice,
  computeVisibility,
  pct,
} from "./brand-metrics";

describe("brand metrics", () => {
  it("computes share of voice as a percentage", () => {
    expect(
      computeShareOfVoice({ brandMentions: 5, totalMentions: 20 }),
    ).toBe(25);
  });

  it("computes average position from known ranks only", () => {
    expect(computeAveragePosition([1, 2, null, 5])).toBe(2.67);
  });

  it("computes citation rate as a percentage", () => {
    expect(computeCitationRate({ citedRuns: 3, totalRuns: 10 })).toBe(30);
  });

  it("computes visibility as a percentage", () => {
    expect(computeVisibility({ mentions: 4, totalRuns: 8 })).toBe(50);
  });

  it("returns zero for invalid percentage denominators", () => {
    expect(pct(4, 0)).toBe(0);
    expect(computeVisibility({ mentions: 4, totalRuns: 0 })).toBe(0);
    expect(computeCitationRate({ citedRuns: 1, totalRuns: 0 })).toBe(0);
  });

  it("returns null when average position has no known ranks", () => {
    expect(computeAveragePosition([null, undefined])).toBeNull();
  });
});
