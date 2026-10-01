import { describe, expect, it } from "vitest";
import { isSquareNight } from "./amsterdam-night";

describe("isSquareNight", () => {
  it("follows Amsterdam time, not the visitor's clock", () => {
    // 19:30 UTC in summer is 21:30 in Amsterdam (CEST, UTC+2).
    expect(isSquareNight(new Date("2026-07-01T19:30:00Z"))).toBe(true);
    // 12:00 UTC is 14:00 in Amsterdam.
    expect(isSquareNight(new Date("2026-07-01T12:00:00Z"))).toBe(false);
  });

  it("lights up from 20:00 until 07:00, across winter time too", () => {
    // Winter (CET, UTC+1): 19:00 UTC is 20:00 in Amsterdam.
    expect(isSquareNight(new Date("2026-01-15T19:00:00Z"))).toBe(true);
    expect(isSquareNight(new Date("2026-01-15T18:59:00Z"))).toBe(false);
    // 05:59 UTC is 06:59 → still night; 06:00 UTC is 07:00 → day.
    expect(isSquareNight(new Date("2026-01-15T05:59:00Z"))).toBe(true);
    expect(isSquareNight(new Date("2026-01-15T06:00:00Z"))).toBe(false);
  });
});
