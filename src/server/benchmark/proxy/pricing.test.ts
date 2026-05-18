import { describe, expect, it } from "vitest";

import { estimateCostCents } from "./pricing";

describe("estimateCostCents", () => {
  it("returns null for a surface without pricing", () => {
    expect(estimateCostCents("claude_grounded", 100, 100)).toBeNull();
  });

  it("computes a non-trivial cost for chatgpt_grounded with usage", () => {
    // 1000 input + 1000 output tokens. Per-1M rates: 250 / 1000 cents.
    // input = 0.25, output = 1.0, surcharge = 3 → ceil(4.25) = 5
    expect(estimateCostCents("chatgpt_grounded", 1000, 1000)).toBe(5);
  });

  it("returns just the per-call surcharge when token usage is unknown", () => {
    expect(estimateCostCents("chatgpt_grounded", null, null)).toBe(3);
  });

  it("scales linearly with token usage", () => {
    expect(estimateCostCents("chatgpt_grounded", 1_000_000, 0)).toBe(253);
    expect(estimateCostCents("chatgpt_grounded", 0, 1_000_000)).toBe(1003);
  });
});
