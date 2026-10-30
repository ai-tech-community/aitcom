import { describe, expect, it } from "vitest";

import {
  isoToLocalDateTime,
  localDateTimeToIso,
  scheduleProblem,
} from "./schedule";

const now = new Date("2026-10-27T10:00:00Z");
const minute = 60_000;
const day = 24 * 60 * minute;

describe("issue scheduling", () => {
  it("accepts a time in the future within a year", () => {
    expect(scheduleProblem(new Date(now.getTime() + minute), now)).toBeNull();
    expect(
      scheduleProblem(new Date(now.getTime() + 365 * day), now),
    ).toBeNull();
  });

  it("refuses a past time and a time over a year away", () => {
    expect(scheduleProblem(now, now)).toBe("SCHEDULE_IN_PAST");
    expect(scheduleProblem(new Date(now.getTime() - minute), now)).toBe(
      "SCHEDULE_IN_PAST",
    );
    expect(scheduleProblem(new Date(now.getTime() + 366 * day), now)).toBe(
      "SCHEDULE_TOO_FAR",
    );
  });

  it("reads a datetime-local value as local time", () => {
    expect(localDateTimeToIso("2026-11-02T09:00")).toBe(
      new Date(2026, 10, 2, 9, 0).toISOString(),
    );
    for (const value of [
      "2026-13-02T09:00",
      "2026-02-30T09:00",
      "2026-11-02T24:00",
      "2026-11-02T09:00Z",
      "",
      "tomorrow",
    ]) {
      expect(localDateTimeToIso(value)).toBeNull();
    }
  });

  it("round-trips for the input", () => {
    expect(isoToLocalDateTime(localDateTimeToIso("2026-11-02T09:05")!)).toBe(
      "2026-11-02T09:05",
    );
  });
});
