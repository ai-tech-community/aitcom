import { describe, it, expect } from "vitest";
import {
  BROADCAST_CEILING,
  CEILING_WINDOW_DAYS,
  EVENT_REMINDER_LEAD_HOURS,
  currentWindowKey,
  currentPeriodKey,
} from "./constants";

describe("notification constants", () => {
  it("are the Hub-invariant defaults", () => {
    expect(BROADCAST_CEILING).toBe(3);
    expect(CEILING_WINDOW_DAYS).toBe(7);
    expect(EVENT_REMINDER_LEAD_HOURS).toBe(24);
  });
});

describe("currentWindowKey / currentPeriodKey", () => {
  it("produce a stable ISO-week bucket for a given date", () => {
    const d = new Date("2026-05-30T12:00:00.000Z"); // ISO week 22 of 2026
    expect(currentWindowKey(d)).toBe("2026-W22");
    expect(currentPeriodKey(d)).toBe("2026-W22");
  });
  it("bucket two days in the same ISO week identically", () => {
    expect(currentWindowKey(new Date("2026-05-25T00:00:00Z"))).toBe(
      currentWindowKey(new Date("2026-05-29T23:59:59Z")),
    );
  });
});
