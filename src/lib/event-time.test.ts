import { describe, expect, it } from "vitest";

import {
  upcomingEvents,
  upcomingEventsQueryFloor,
  DEFAULT_EVENT_TIMEZONE,
  eventWallTimeToUtc,
  formatEventIsoWithOffset,
  formatEventTimeRange,
  completeUpcomingCandidates,
  eventDayFormatter,
  eventDayParts,
  eventEndInstant,
  formatEventShortWhen,
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

describe("upcomingEvents", () => {
  // 22:30 UTC = 00:30 on the 24th in Amsterdam (CEST), 18:30 on the 23rd in New York.
  const now = new Date("2026-09-23T22:30:00.000Z");

  it("keeps today and later, soonest first, and drops past events", () => {
    expect(
      upcomingEvents(
        [
          { id: "later", date: "2026-10-05T00:00:00.000Z", timezone: "UTC" },
          { id: "past", date: "2026-09-01T00:00:00.000Z", timezone: "UTC" },
          { id: "today", date: "2026-09-23T00:00:00.000Z", timezone: "UTC" },
        ],
        now,
      ).map((event) => event.id),
    ).toEqual(["today", "later"]);
  });

  it("judges today in the event's own zone", () => {
    // Already the 24th in Amsterdam, so an event there on the 23rd is past.
    expect(
      upcomingEvents(
        [{ id: "ams", date: "2026-09-23", timezone: "Europe/Amsterdam" }],
        now,
      ),
    ).toEqual([]);
    // …but still the 23rd in New York.
    expect(
      upcomingEvents(
        [{ id: "nyc", date: "2026-09-23", timezone: "America/New_York" }],
        now,
      ).map((event) => event.id),
    ).toEqual(["nyc"]);
  });

  it("drops rows without a usable date", () => {
    expect(upcomingEvents([{ date: "soon" }], now)).toEqual([]);
  });

  it("orders same-day events by start time, whatever the database order", () => {
    const early = new Date("2026-10-10T06:00:00.000Z");
    expect(
      upcomingEvents(
        [
          {
            id: 7,
            date: "2026-10-10T00:00:00.000Z",
            startTime: "19:00",
            timezone: "Europe/Amsterdam",
          },
          {
            id: 9,
            date: "2026-10-10T00:00:00.000Z",
            startTime: "10:00",
            timezone: "Europe/Amsterdam",
          },
        ],
        early,
      ).map((event) => event.id),
    ).toEqual([9, 7]);
  });

  it("orders by the real instant across zones", () => {
    // 09:00 in San Francisco is 18:00 in Amsterdam: the Amsterdam 17:00 talk is first.
    expect(
      upcomingEvents(
        [
          {
            id: "sf",
            date: "2026-10-10",
            startTime: "09:00",
            timezone: "America/Los_Angeles",
          },
          {
            id: "ams",
            date: "2026-10-10",
            startTime: "17:00",
            timezone: "Europe/Amsterdam",
          },
        ],
        new Date("2026-10-01T00:00:00.000Z"),
      ).map((event) => event.id),
    ).toEqual(["ams", "sf"]);
  });

  it("breaks exact ties by id, so the order is stable", () => {
    const same = { date: "2026-10-10", startTime: "10:00", timezone: "UTC" };
    const early = new Date("2026-10-01T00:00:00.000Z");
    expect(
      upcomingEvents(
        [
          { id: 12, ...same },
          { id: 3, ...same },
        ],
        early,
      ).map((e) => e.id),
    ).toEqual([3, 12]);
    expect(
      upcomingEvents(
        [
          { id: 3, ...same },
          { id: 12, ...same },
        ],
        early,
      ).map((e) => e.id),
    ).toEqual([3, 12]);
  });

  it("lets an event that has ended today yield to the next one", () => {
    const events = [
      {
        id: "morning",
        date: "2026-10-10",
        startTime: "09:00",
        endTime: "12:00",
        timezone: "Europe/Amsterdam",
      },
      {
        id: "evening",
        date: "2026-10-10",
        startTime: "19:00",
        endTime: "21:00",
        timezone: "Europe/Amsterdam",
      },
    ];
    // 11:00 in Amsterdam: the morning session is still running.
    expect(
      upcomingEvents(events, new Date("2026-10-10T09:00:00.000Z")).map(
        (e) => e.id,
      ),
    ).toEqual(["morning", "evening"]);
    // 12:30 in Amsterdam: it is over.
    expect(
      upcomingEvents(events, new Date("2026-10-10T10:30:00.000Z")).map(
        (e) => e.id,
      ),
    ).toEqual(["evening"]);
  });

  it("keeps an event without an end time for the rest of its day", () => {
    const hack = {
      id: "hack",
      date: "2026-10-10",
      startTime: "09:00",
      timezone: "Europe/Amsterdam",
    };
    // 23:00 in Amsterdam.
    expect(
      upcomingEvents([hack], new Date("2026-10-10T21:00:00.000Z")),
    ).toEqual([hack]);
    // 00:30 the next day.
    expect(
      upcomingEvents([hack], new Date("2026-10-10T22:30:00.000Z")),
    ).toEqual([]);
  });

  it("keeps a late event that runs past midnight until it really ends", () => {
    const party = {
      id: "late",
      date: "2026-10-10",
      startTime: "22:00",
      endTime: "02:00",
      timezone: "Europe/Amsterdam",
    };
    // 01:00 on the 11th in Amsterdam.
    expect(
      upcomingEvents([party], new Date("2026-10-10T23:00:00.000Z")),
    ).toEqual([party]);
    // 02:30 on the 11th.
    expect(
      upcomingEvents([party], new Date("2026-10-11T00:30:00.000Z")),
    ).toEqual([]);
  });
});

describe("eventEndInstant", () => {
  it("is unknown without both a start and an end time", () => {
    expect(
      eventEndInstant({
        date: "2026-10-10",
        startTime: "09:00",
        timezone: "UTC",
      }),
    ).toBeNull();
    expect(
      eventEndInstant({
        date: "2026-10-10",
        endTime: "17:00",
        timezone: "UTC",
      }),
    ).toBeNull();
  });

  it("rolls an end before the start into the next day", () => {
    expect(
      eventEndInstant({
        date: "2026-10-10",
        startTime: "22:00",
        endTime: "02:00",
        timezone: "Europe/Amsterdam",
      })?.toISOString(),
    ).toBe("2026-10-11T00:00:00.000Z");
  });
});

describe("completeUpcomingCandidates", () => {
  const row = (id: number, date: string) => ({ id, date });

  it("keeps a page that was not full", () => {
    const rows = [row(1, "2026-10-10"), row(2, "2026-10-20")];
    expect(completeUpcomingCandidates(rows, 5)).toEqual(rows);
  });

  it("drops the last fetched day and the two before it when the page was full", () => {
    const rows = [
      row(1, "2026-10-01"),
      row(2, "2026-10-07"),
      row(3, "2026-10-08"),
      row(4, "2026-10-09"),
      row(5, "2026-10-10"),
    ];
    expect(completeUpcomingCandidates(rows, 5).map((r) => r.id)).toEqual([
      1, 2,
    ]);
  });

  it("never keeps a row that an unfetched row could start before", () => {
    // Full page; the last day's ties may be cut. The latest kept row, late
    // in UTC−12, must still start before an unfetched row early in UTC+14.
    const rows = [
      row(1, "2026-10-06"),
      row(2, "2026-10-07"),
      row(3, "2026-10-10"),
    ];
    const kept = completeUpcomingCandidates(rows, 3);
    expect(kept.map((r) => r.id)).toEqual([1, 2]);
    const latestKept = eventWallTimeToUtc("2026-10-07", "23:59", "Etc/GMT+12");
    const earliestCut = eventWallTimeToUtc(
      "2026-10-10",
      "00:00",
      "Pacific/Kiritimati",
    );
    expect(latestKept.getTime()).toBeLessThan(earliestCut.getTime());
  });
});

describe("formatEventShortWhen", () => {
  it("renders a compact English day with the start time", () => {
    expect(
      formatEventShortWhen(
        { date: "2026-10-10T00:00:00.000Z", startTime: "19:00" },
        "en",
      ),
    ).toBe("Sat 10 Oct · 19:00");
  });

  it("renders Dutch without locale punctuation", () => {
    expect(
      formatEventShortWhen({ date: "2026-10-10", startTime: "19:00" }, "nl"),
    ).toBe("za 10 okt · 19:00");
  });

  it("omits the time when there is no start time", () => {
    expect(
      formatEventShortWhen({ date: "2026-10-10", startTime: null }, "en"),
    ).toBe("Sat 10 Oct");
  });

  it("falls back to the raw date for a corrupt row", () => {
    expect(
      formatEventShortWhen({ date: "garbage", startTime: null }, "en"),
    ).toBe("garbage");
  });
});

describe("eventDayParts", () => {
  it("splits the stored day into localised parts", () => {
    expect(eventDayParts("2026-10-05T00:00:00.000Z", "en")).toEqual({
      iso: "2026-10-05",
      year: 2026,
      day: 5,
      weekday: "Mon",
      month: "Oct",
    });
    expect(eventDayParts("2026-10-05", "nl")).toMatchObject({
      weekday: "ma",
      month: "okt",
    });
  });

  it("returns null for a corrupt row", () => {
    expect(eventDayParts("garbage", "en")).toBeNull();
  });
});

describe("eventDayFormatter", () => {
  it("gives each locale and shape its own formatter", () => {
    const short = eventDayFormatter("en", { day: "numeric", month: "short" });
    const long = eventDayFormatter("en", { day: "numeric", month: "long" });
    const day = new Date(Date.UTC(2026, 8, 29));
    expect(short.format(day)).toBe("Sep 29");
    expect(long.format(day)).toBe("September 29");
    expect(
      eventDayFormatter("nl", { day: "numeric", month: "long" }).format(day),
    ).toBe("29 september");
  });

  it("reuses one formatter for the same shape, in any key order", () => {
    expect(eventDayFormatter("en", { day: "numeric", month: "short" })).toBe(
      eventDayFormatter("en", { month: "short", day: "numeric" }),
    );
  });

  it("always renders the stored day in UTC", () => {
    expect(
      eventDayFormatter("en", { day: "numeric" }).resolvedOptions().timeZone,
    ).toBe("UTC");
  });
});

describe("upcomingEventsQueryFloor", () => {
  it("keeps an event that is still today in its zone after 00:00 UTC", () => {
    // 23:30 in Amsterdam on 10 Oct is already 21:30 UTC; a Tokyo event on
    // 11 Oct stored as local midnight is 10 Oct 15:00 UTC.
    const now = new Date("2026-10-10T21:30:00.000Z");
    const amsterdamToday = {
      date: "2026-10-10T00:00:00.000Z",
      timezone: "Europe/Amsterdam",
    };
    const floor = upcomingEventsQueryFloor(now);
    expect(amsterdamToday.date >= now.toISOString()).toBe(false); // old query
    expect(amsterdamToday.date >= floor).toBe(true);
    expect(upcomingEvents([amsterdamToday], now)).toEqual([amsterdamToday]);
  });

  it("still excludes events that are over everywhere", () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const past = { date: "2026-10-09T00:00:00.000Z", timezone: "UTC" };
    expect(past.date >= upcomingEventsQueryFloor(now)).toBe(true);
    expect(upcomingEvents([past], now)).toEqual([]);
  });
});
