import { describe, expect, it } from "vitest";
import {
  computeBrandMetricSummary,
  computeAveragePosition,
  computeCitationRate,
  computeShareOfVoice,
  computeVisibility,
  deriveOwnedDomains,
  pct,
} from "./brand-metrics";

describe("brand metrics", () => {
  it("computes share of voice as a percentage", () => {
    expect(computeShareOfVoice({ brandMentions: 5, totalMentions: 20 })).toBe(
      25,
    );
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

  it("derives an owned domain from a brand website", () => {
    expect(deriveOwnedDomains("https://www.Example.com/products")).toEqual([
      "example.com",
    ]);
    expect(deriveOwnedDomains("https://aws.amazon.com")).toContain(
      "amazon.com",
    );
    expect(deriveOwnedDomains("https://cloud.google.com")).toContain(
      "google.com",
    );
    expect(deriveOwnedDomains("acme.io")).toEqual(["acme.io"]);
    expect(deriveOwnedDomains("https://docs.python.org/3/")).toEqual([
      "python.org",
    ]);
    expect(deriveOwnedDomains(null)).toEqual([]);
  });

  it("uses distinct brand-mentioned runs as the visibility numerator", () => {
    const summary = computeBrandMetricSummary({
      brandMentionRuns: 2,
      brandMentions: 4,
      totalMentions: 20,
      eligibleRuns: 10,
      ranks: [1, 3],
      sentimentScore: 12.5,
      ownedSourceRuns: 2,
      citedRuns: 3,
    });

    expect(summary.visibilityPct).toBe(20);
    expect(summary.sampleSize).toBe(10);
    expect(summary.shareOfVoicePct).toBe(20);
    expect(summary.avgPosition).toBe(2);
    expect(summary.sentimentScore).toBe(12.5);
    expect(summary.sourceVisibilityPct).toBe(20);
    expect(summary.citationRatePct).toBe(30);
  });

  it("keeps source visibility and citation rate bounded and null safe", () => {
    const summary = computeBrandMetricSummary({
      brandMentionRuns: 0,
      brandMentions: 0,
      totalMentions: 0,
      eligibleRuns: 4,
      ranks: [null],
      sentimentScore: Number.NaN,
      ownedSourceRuns: 8,
      citedRuns: 6,
    });

    expect(summary.visibilityPct).toBe(0);
    expect(summary.shareOfVoicePct).toBe(0);
    expect(summary.avgPosition).toBeNull();
    expect(summary.sentimentScore).toBe(0);
    expect(summary.sourceVisibilityPct).toBe(100);
    expect(summary.citationRatePct).toBe(100);
  });
});
