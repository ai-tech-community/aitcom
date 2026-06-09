import { describe, expect, it } from "vitest";

import { computeCommissionedCellXp } from "./commissioned-cell-xp";

/**
 * Pure verification-gated XP math for commissioned work-cells (ADR-0022/0023).
 * Base XP is 50; the verification mode scales it, and only a "verified"
 * outcome pays. These tests pin the gate so a self-report can never mint the
 * same XP as a consensus-verified cell.
 */
describe("computeCommissionedCellXp", () => {
  it("pays the high consensus weight for a verified consensus cell (50 * 1.5)", () => {
    expect(computeCommissionedCellXp("consensus", "verified")).toBe(75);
  });

  it("pays the high test weight for a verified test cell (50 * 1.5)", () => {
    expect(computeCommissionedCellXp("test", "verified")).toBe(75);
  });

  it("pays only the small self-report fraction for a verified self-report cell (50 * 0.2)", () => {
    expect(computeCommissionedCellXp("self-report", "verified")).toBe(10);
  });

  it("pays strictly less for a verified self-report than a verified consensus cell", () => {
    expect(computeCommissionedCellXp("self-report", "verified")).toBeLessThan(
      computeCommissionedCellXp("consensus", "verified"),
    );
  });

  it("pays nothing for a failed outcome regardless of mode", () => {
    expect(computeCommissionedCellXp("consensus", "failed")).toBe(0);
    expect(computeCommissionedCellXp("self-report", "failed")).toBe(0);
  });

  it("pays nothing for a pending outcome regardless of mode", () => {
    expect(computeCommissionedCellXp("consensus", "pending")).toBe(0);
    expect(computeCommissionedCellXp("self-report", "pending")).toBe(0);
  });

  it("pays the peer-review weight for a verified peer-review cell (50 * 1.3)", () => {
    expect(computeCommissionedCellXp("peer-review", "verified")).toBe(65);
  });

  it("pays the platform-action weight for a verified platform-action cell (50 * 1.0)", () => {
    // Numerically equal to the unknown-mode fallback (weight 1), but a KNOWN
    // mode in its own right — pin it so the two are never conflated.
    expect(computeCommissionedCellXp("platform-action", "verified")).toBe(50);
  });

  it("falls back to weight 1 for an unknown verification mode (50 * 1)", () => {
    expect(computeCommissionedCellXp("mystery-mode", "verified")).toBe(50);
  });

  it("still gates the unknown-mode fallback behind a verified outcome", () => {
    expect(computeCommissionedCellXp("mystery-mode", "failed")).toBe(0);
    expect(computeCommissionedCellXp("mystery-mode", "pending")).toBe(0);
  });
});
