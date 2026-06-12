import { describe, expect, it } from "vitest";

import {
  DEFAULT_EVENT_TIMEZONE,
  eventWallTimeToUtc,
  formatEventIsoWithOffset,
  formatEventTimeRange,
  formatEventWhenText,
  formatInstantInZone,
  getTimeZoneAbbreviation,
  instantToZonedDateString,
  isValidTimeZone,
} from "./event-time";

describe("DEFAULT_EVENT_TIMEZONE", () => {
  it("is a valid IANA timezone (used by the backfill migration)", () => {
    expect(DEFAULT_EVENT_TIMEZONE).toBe("Europe/Amsterdam");
    expect(isValidTimeZone(DEFAULT_EVENT_TIMEZONE)).toBe(true);
  });
});

describe("isValidTimeZone", () => {
  it("accepts canonical IANA names", () => {
    expect(isValidTimeZone("Europe/Amsterdam")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects garbage, empty, and non-IANA values", () => {
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("   ")).toBe(false);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("CEST")).toBe(false);
    expect(isValidTimeZone("Amsterdam")).toBe(false);
  });
});

describe("eventWallTimeToUtc", () => {
  it("converts a CET (winter) wall time in Europe/Amsterdam to the right instant", () => {
    // 2026-01-15 18:00 in Amsterdam is CET (UTC+1) → 17:00Z
    const instant = eventWallTimeToUtc(
      "2026-01-15T00:00:00.000Z",
      "18:00",
      "Europe/Amsterdam",
    );
    expect(instant.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("converts a CEST (summer/DST) wall time in Europe/Amsterdam to the right instant", () => {
    // 2026-07-15 18:00 in Amsterdam is CEST (UTC+2) → 16:00Z
    const instant = eventWallTimeToUtc(
      "2026-07-15T00:00:00.000Z",
      "18:00",
      "Europe/Amsterdam",
    );
    expect(instant.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("handles the evening of the spring-forward day correctly", () => {
    // DST starts 2026-03-29 02:00 CET in Amsterdam; 18:00 that day is CEST (+2)
    const instant = eventWallTimeToUtc(
      "2026-03-29T00:00:00.000Z",
      "18:00",
      "Europe/Amsterdam",
    );
    expect(instant.toISOString()).toBe("2026-03-29T16:00:00.000Z");
  });

  it("handles the morning before spring-forward correctly", () => {
    // 01:00 on 2026-03-29 is still CET (+1)
    const instant = eventWallTimeToUtc(
      "2026-03-29T00:00:00.000Z",
      "01:00",
      "Europe/Amsterdam",
    );
    expect(instant.toISOString()).toBe("2026-03-29T00:00:00.000Z");
  });

  it("supports zones with non-hour offsets", () => {
    // Asia/Kolkata is UTC+5:30 year-round
    const instant = eventWallTimeToUtc(
      "2026-07-15T00:00:00.000Z",
      "09:00",
      "Asia/Kolkata",
    );
    expect(instant.toISOString()).toBe("2026-07-15T03:30:00.000Z");
  });

  it("accepts a bare YYYY-MM-DD date", () => {
    const instant = eventWallTimeToUtc("2026-01-15", "18:00", "UTC");
    expect(instant.toISOString()).toBe("2026-01-15T18:00:00.000Z");
  });

  // DST edge cases — pinning the offset-inversion behavior as intended.
  it("resolves a nonexistent spring-forward wall time by shifting forward", () => {
    // 02:30 on 2026-03-29 does not exist in Europe/Amsterdam (clocks jump
    // 02:00 CET → 03:00 CEST). The two-pass inversion lands on 01:30Z, i.e.
    // the wall time shifts forward to 03:30 CEST.
    const instant = eventWallTimeToUtc(
      "2026-03-29T00:00:00.000Z",
      "02:30",
      "Europe/Amsterdam",
    );
    expect(instant.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(formatInstantInZone(instant, "Europe/Amsterdam")).toEqual({
      date: "2026-03-29",
      time: "03:30",
      abbreviation: "CEST",
    });
  });

  it("resolves an ambiguous fall-back wall time to the second occurrence (CET)", () => {
    // 02:30 on 2026-10-25 occurs twice in Europe/Amsterdam (clocks fall back
    // 03:00 CEST → 02:00 CET). The inversion picks the post-transition CET
    // occurrence: 01:30Z, not the earlier 00:30Z CEST one.
    const instant = eventWallTimeToUtc(
      "2026-10-25T00:00:00.000Z",
      "02:30",
      "Europe/Amsterdam",
    );
    expect(instant.toISOString()).toBe("2026-10-25T01:30:00.000Z");
    expect(getTimeZoneAbbreviation("Europe/Amsterdam", instant)).toBe("CET");
  });
});

describe("instantToZonedDateString", () => {
  it("returns the next calendar day for an early-morning Tokyo event", () => {
    // 17:00Z on Jul 14 is already 02:00 on Jul 15 in Tokyo.
    expect(
      instantToZonedDateString("2026-07-14T17:00:00.000Z", "Asia/Tokyo"),
    ).toBe("2026-07-15");
  });

  it("returns the previous calendar day for a late-evening New York event", () => {
    // 02:00Z on Jul 15 is still 22:00 on Jul 14 in New York (EDT).
    expect(
      instantToZonedDateString("2026-07-15T02:00:00.000Z", "America/New_York"),
    ).toBe("2026-07-14");
  });

  it("falls back to the UTC calendar date without a usable timezone", () => {
    expect(instantToZonedDateString("2026-07-15T02:00:00.000Z", null)).toBe(
      "2026-07-15",
    );
  });

  it("falls back to the raw date part for an unparseable instant", () => {
    expect(instantToZonedDateString("not-a-date", "Asia/Tokyo")).toBe(
      "not-a-date",
    );
  });
});

describe("getTimeZoneAbbreviation", () => {
  it("returns CET in winter and CEST in summer for Europe/Amsterdam", () => {
    expect(
      getTimeZoneAbbreviation(
        "Europe/Amsterdam",
        new Date("2026-01-15T17:00:00.000Z"),
      ),
    ).toBe("CET");
    expect(
      getTimeZoneAbbreviation(
        "Europe/Amsterdam",
        new Date("2026-07-15T16:00:00.000Z"),
      ),
    ).toBe("CEST");
  });

  it("falls back to the IANA name for an invalid zone", () => {
    expect(getTimeZoneAbbreviation("Not/A_Zone", new Date())).toBe(
      "Not/A_Zone",
    );
  });
});

describe("formatEventTimeRange", () => {
  it("renders start–end with the event-zone abbreviation", () => {
    expect(
      formatEventTimeRange({
        date: "2026-07-15T00:00:00.000Z",
        startTime: "18:00",
        endTime: "21:00",
        timezone: "Europe/Amsterdam",
      }),
    ).toBe("18:00–21:00 CEST");
  });

  it("renders a start-only time with abbreviation (winter)", () => {
    expect(
      formatEventTimeRange({
        date: "2026-01-15T00:00:00.000Z",
        startTime: "18:00",
        endTime: null,
        timezone: "Europe/Amsterdam",
      }),
    ).toBe("18:00 CET");
  });

  it("returns null without a start time", () => {
    expect(
      formatEventTimeRange({
        date: "2026-01-15T00:00:00.000Z",
        startTime: null,
        endTime: null,
        timezone: "Europe/Amsterdam",
      }),
    ).toBeNull();
  });

  it("omits the abbreviation when the timezone is missing or invalid", () => {
    expect(
      formatEventTimeRange({
        date: "2026-01-15T00:00:00.000Z",
        startTime: "18:00",
        endTime: "21:00",
        timezone: null,
      }),
    ).toBe("18:00–21:00");
  });

  it("omits the abbreviation for a malformed date instead of throwing", () => {
    expect(
      formatEventTimeRange({
        date: "not-a-date",
        startTime: "18:00",
        endTime: "21:00",
        timezone: "Europe/Amsterdam",
      }),
    ).toBe("18:00–21:00");
  });
});

describe("formatInstantInZone", () => {
  it("converts an instant to wall-clock parts in another zone", () => {
    // 18:00 CEST in Amsterdam = 12:00 EDT in New York, same day
    const instant = new Date("2026-07-15T16:00:00.000Z");
    expect(formatInstantInZone(instant, "America/New_York")).toEqual({
      date: "2026-07-15",
      time: "12:00",
      abbreviation: "EDT",
    });
  });

  it("reports a date shift when the viewer is across the date line", () => {
    // 18:00 CET on Jan 15 = 02:00 on Jan 16 in Tokyo
    const instant = new Date("2026-01-15T17:00:00.000Z");
    expect(formatInstantInZone(instant, "Asia/Tokyo")).toEqual({
      date: "2026-01-16",
      time: "02:00",
      abbreviation: "GMT+9",
    });
  });
});

describe("formatEventWhenText", () => {
  it("includes date, time range, abbreviation, and IANA name for emails", () => {
    expect(
      formatEventWhenText({
        date: "2026-07-15T00:00:00.000Z",
        startTime: "18:00",
        endTime: "21:00",
        timezone: "Europe/Amsterdam",
      }),
    ).toBe("15 Jul 2026, 18:00–21:00 CEST (Europe/Amsterdam)");
  });

  it("renders the date alone when no start time exists", () => {
    expect(
      formatEventWhenText({
        date: "2026-01-15T00:00:00.000Z",
        startTime: null,
        endTime: null,
        timezone: "Europe/Amsterdam",
      }),
    ).toBe("15 Jan 2026");
  });

  it("survives a missing timezone", () => {
    expect(
      formatEventWhenText({
        date: "2026-01-15T00:00:00.000Z",
        startTime: "18:00",
        endTime: null,
        timezone: null,
      }),
    ).toBe("15 Jan 2026, 18:00");
  });

  it("falls back to raw-string rendering for a malformed date instead of throwing", () => {
    // The reminder cron formats events in a loop — one corrupt `date` row
    // must not abort the run with "Invalid time value".
    expect(() =>
      formatEventWhenText({
        date: "not-a-date",
        startTime: "18:00",
        endTime: "21:00",
        timezone: "Europe/Amsterdam",
      }),
    ).not.toThrow();
    expect(
      formatEventWhenText({
        date: "not-a-date",
        startTime: "18:00",
        endTime: "21:00",
        timezone: "Europe/Amsterdam",
      }),
    ).toBe("not-a-date, 18:00–21:00");
  });

  it("renders a malformed date alone when no start time exists", () => {
    expect(
      formatEventWhenText({
        date: "garbage",
        startTime: null,
        endTime: null,
        timezone: "Europe/Amsterdam",
      }),
    ).toBe("garbage");
  });
});

describe("formatEventIsoWithOffset", () => {
  it("emits an ISO local datetime with the correct UTC offset (CEST)", () => {
    expect(
      formatEventIsoWithOffset(
        "2026-07-15T00:00:00.000Z",
        "18:00",
        "Europe/Amsterdam",
      ),
    ).toBe("2026-07-15T18:00:00+02:00");
  });

  it("emits the winter offset (CET)", () => {
    expect(
      formatEventIsoWithOffset(
        "2026-01-15T00:00:00.000Z",
        "18:00",
        "Europe/Amsterdam",
      ),
    ).toBe("2026-01-15T18:00:00+01:00");
  });

  it("handles half-hour offsets", () => {
    expect(
      formatEventIsoWithOffset("2026-07-15", "09:00", "Asia/Kolkata"),
    ).toBe("2026-07-15T09:00:00+05:30");
  });

  it("falls back to a floating local datetime without a usable timezone", () => {
    expect(formatEventIsoWithOffset("2026-07-15", "18:00", null)).toBe(
      "2026-07-15T18:00:00",
    );
  });

  it("falls back to a floating local datetime for a malformed date instead of throwing", () => {
    expect(
      formatEventIsoWithOffset("not-a-date", "18:00", "Europe/Amsterdam"),
    ).toBe("not-a-dateT18:00:00");
  });
});
