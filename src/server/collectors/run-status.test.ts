import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./run-status";

describe("run lifecycle", () => {
  it.each([
    ["queued", "running"],
    ["running", "running"],
    ["running", "succeeded"],
    ["running", "failed"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["queued", "succeeded"],
    ["queued", "failed"],
    ["succeeded", "running"],
    ["failed", "running"],
    ["succeeded", "failed"],
  ] as const)("refuses %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(
      `Illegal collector run transition ${from} → ${to}`,
    );
  });
});
