import { describe, expect, it } from "vitest";
import { detectBrandShifts, type BrandWindowRow } from "./alerts";

describe("detectBrandShifts", () => {
  it("flags brands where 7d visibility differs from 30d by >= 10 points", () => {
    const rows: BrandWindowRow[] = [
      { brandId: "b1", windowDays: 7, mentionsCount: 20, runsTotal: 100 },
      { brandId: "b1", windowDays: 30, mentionsCount: 10, runsTotal: 100 },
      { brandId: "b2", windowDays: 7, mentionsCount: 15, runsTotal: 100 },
      { brandId: "b2", windowDays: 30, mentionsCount: 14, runsTotal: 100 },
    ];
    const result = detectBrandShifts(rows, 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.brandId).toBe("b1");
    expect(result[0]?.currentPct).toBe(20);
    expect(result[0]?.baselinePct).toBe(10);
    expect(result[0]?.deltaPct).toBe(10);
  });

  it("skips brands with no 30d baseline", () => {
    const rows: BrandWindowRow[] = [
      { brandId: "b1", windowDays: 7, mentionsCount: 20, runsTotal: 100 },
    ];
    expect(detectBrandShifts(rows, 10)).toEqual([]);
  });

  it("skips brands with no 7d current data", () => {
    const rows: BrandWindowRow[] = [
      { brandId: "b1", windowDays: 30, mentionsCount: 20, runsTotal: 100 },
    ];
    expect(detectBrandShifts(rows, 10)).toEqual([]);
  });

  it("detects drops (negative delta with absolute >= threshold)", () => {
    const rows: BrandWindowRow[] = [
      { brandId: "b1", windowDays: 7, mentionsCount: 5, runsTotal: 100 },
      { brandId: "b1", windowDays: 30, mentionsCount: 25, runsTotal: 100 },
    ];
    const r = detectBrandShifts(rows, 10);
    expect(r[0]?.deltaPct).toBe(-20);
  });

  it("treats runsTotal=0 as zero percent", () => {
    const rows: BrandWindowRow[] = [
      { brandId: "b1", windowDays: 7, mentionsCount: 0, runsTotal: 0 },
      { brandId: "b1", windowDays: 30, mentionsCount: 20, runsTotal: 100 },
    ];
    const r = detectBrandShifts(rows, 10);
    expect(r[0]?.currentPct).toBe(0);
    expect(r[0]?.baselinePct).toBe(20);
    expect(r[0]?.deltaPct).toBe(-20);
  });

  it("aggregates across models for the same brand before comparing", () => {
    const rows: BrandWindowRow[] = [
      { brandId: "b1", windowDays: 7, mentionsCount: 5, runsTotal: 50 },
      { brandId: "b1", windowDays: 7, mentionsCount: 15, runsTotal: 50 },
      { brandId: "b1", windowDays: 30, mentionsCount: 10, runsTotal: 100 },
    ];
    const r = detectBrandShifts(rows, 5);
    expect(r[0]?.currentPct).toBe(20); // (5+15)/(50+50) * 100
    expect(r[0]?.baselinePct).toBe(10);
  });
});
