import { describe, expect, it } from "vitest";
import { buildSparkline } from "./build-sparkline";

describe("buildSparkline", () => {
  it("returns BUCKETS zero-filled points for empty input", () => {
    const out = buildSparkline([], 30, 30);
    expect(out).toHaveLength(30);
    expect(out.every((p) => p.value === 0)).toBe(true);
  });

  it("places a single-day value into the correct bucket", () => {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const out = buildSparkline([{ date: iso, value: 42 }], 30, 30);
    expect(out).toHaveLength(30);
    expect(out[out.length - 1]!.value).toBe(42);
    expect(out[0]!.value).toBe(0);
  });

  it("averages multiple points that fall in the same bucket", () => {
    const d = new Date();
    const iso1 = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() - 1);
    const iso2 = d.toISOString().slice(0, 10);
    const out = buildSparkline(
      [
        { date: iso1, value: 10 },
        { date: iso2, value: 30 },
      ],
      7,
      7,
    );
    expect(out).toHaveLength(7);
    expect(out[out.length - 1]!.value).toBe(10);
    expect(out[out.length - 2]!.value).toBe(30);
  });

  it("ignores points outside the window", () => {
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 400);
    const iso = old.toISOString().slice(0, 10);
    const out = buildSparkline([{ date: iso, value: 99 }], 30, 30);
    expect(out.every((p) => p.value === 0)).toBe(true);
  });

  it("is deterministic — same input returns same bucket timestamps across calls", () => {
    const a = buildSparkline([], 30, 30);
    const b = buildSparkline([], 30, 30);
    expect(a.map((p) => p.date)).toEqual(b.map((p) => p.date));
  });
});
