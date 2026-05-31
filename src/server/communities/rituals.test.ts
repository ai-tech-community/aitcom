import { describe, it, expect } from "vitest";
import {
  dateKey,
  weekdayOf,
  weekdayLabel,
  isRitualDue,
  nextFireDate,
} from "./rituals";

// Fixed instants (UTC). 2026-06-01 is a Monday (weekday 1).
const MON = new Date("2026-06-01T13:00:00.000Z");
const TUE = new Date("2026-06-02T13:00:00.000Z");

describe("dateKey / weekdayOf / weekdayLabel", () => {
  it("dateKey returns the UTC YYYY-MM-DD", () => {
    expect(dateKey(MON)).toBe("2026-06-01");
  });
  it("weekdayOf returns 0=Sun..6=Sat in UTC", () => {
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf(TUE)).toBe(2);
  });
  it("weekdayLabel maps to a short name", () => {
    expect(weekdayLabel(1)).toBe("Mon");
    expect(weekdayLabel(0)).toBe("Sun");
  });
});

describe("isRitualDue", () => {
  it("fires when active, weekday matches, and not yet fired today", () => {
    expect(
      isRitualDue({ weekday: 1, status: "active", lastFiredOn: null }, MON),
    ).toBe(true);
  });
  it("does not fire on a non-matching weekday", () => {
    expect(
      isRitualDue({ weekday: 1, status: "active", lastFiredOn: null }, TUE),
    ).toBe(false);
  });
  it("does not fire twice the same day (lastFiredOn === today)", () => {
    expect(
      isRitualDue(
        { weekday: 1, status: "active", lastFiredOn: "2026-06-01" },
        MON,
      ),
    ).toBe(false);
  });
  it("fires again a week later after a prior fire", () => {
    const nextMon = new Date("2026-06-08T13:00:00.000Z");
    expect(
      isRitualDue(
        { weekday: 1, status: "active", lastFiredOn: "2026-06-01" },
        nextMon,
      ),
    ).toBe(true);
  });
  it("never fires when paused", () => {
    expect(
      isRitualDue({ weekday: 1, status: "paused", lastFiredOn: null }, MON),
    ).toBe(false);
  });
});

describe("nextFireDate", () => {
  it("returns today's date when today matches the weekday", () => {
    expect(nextFireDate(1, MON)).toBe("2026-06-01");
  });
  it("returns the next matching weekday when today does not match", () => {
    // From Tuesday, next Monday is 2026-06-08
    expect(nextFireDate(1, TUE)).toBe("2026-06-08");
  });
});
