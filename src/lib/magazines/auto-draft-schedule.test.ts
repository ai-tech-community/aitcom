import { describe, expect, it } from "vitest";

import { DEFAULT_AUTO_DRAFT_SETTINGS } from "./auto-draft";
import {
  calendarPeriod,
  isPeriodDue,
  lookBackWindow,
  nextDraftAt,
} from "./auto-draft-schedule";

const settings = { ...DEFAULT_AUTO_DRAFT_SETTINGS, enabled: true, monthDay: 5 };
const date = (value: string) => new Date(value);

describe("automatic draft calendar", () => {
  it("monthly is due from the chosen day", () => {
    expect(calendarPeriod(settings, date("2026-11-07T10:00:00Z"))).toEqual({
      key: "month:2026-11",
      dueAt: date("2026-11-05T00:00:00Z"),
    });
  });

  it("weekly uses ISO weeks", () => {
    const weekly = { ...settings, cadence: "weekly" as const };
    expect(calendarPeriod(weekly, date("2026-10-28T09:00:00Z"))).toEqual({
      key: "week:2026-W44",
      dueAt: date("2026-10-26T00:00:00Z"),
    });
    expect(calendarPeriod(weekly, date("2027-01-01T09:00:00Z"))?.key).toBe(
      "week:2026-W53",
    );
    expect(
      calendarPeriod({ ...weekly, weekday: 7 }, date("2026-10-28T00:00:00Z"))
        ?.dueAt,
    ).toEqual(date("2026-11-01T00:00:00Z"));
  });

  it("every two weeks counts blocks from a fixed Monday", () => {
    const biweekly = { ...settings, cadence: "biweekly" as const };
    expect(calendarPeriod(biweekly, date("2026-10-28T09:00:00Z"))).toEqual({
      key: "fortnight:73",
      dueAt: date("2026-10-19T00:00:00Z"),
    });
    expect(calendarPeriod(biweekly, date("2026-11-02T09:00:00Z"))?.key).toBe(
      "fortnight:74",
    );
    expect(
      calendarPeriod({ ...biweekly, weekday: 3 }, date("2026-10-28T00:00:00Z"))
        ?.dueAt,
    ).toEqual(date("2026-10-21T00:00:00Z"));
  });

  it("after events and on demand have no calendar", () => {
    for (const cadence of ["after_event", "on_demand"] as const) {
      expect(
        calendarPeriod({ ...settings, cadence }, date("2026-11-07T00:00:00Z")),
      ).toBeNull();
    }
  });

  it("a period counts only once the schedule had started", () => {
    const period = {
      key: "month:2026-11",
      dueAt: date("2026-11-05T00:00:00Z"),
    };
    expect(isPeriodDue(period, date("2026-11-07"), date("2026-11-01"))).toBe(
      true,
    );
    expect(isPeriodDue(period, date("2026-11-07"), date("2026-11-06"))).toBe(
      false,
    );
    expect(isPeriodDue(period, date("2026-11-04"), date("2026-11-01"))).toBe(
      false,
    );
    expect(isPeriodDue(period, date("2026-11-07"), null)).toBe(false);
  });

  it("names the next draft day", () => {
    expect(
      nextDraftAt(settings, date("2026-11-07"), date("2026-11-01")),
    ).toEqual(date("2026-12-05T00:00:00Z"));
    expect(
      nextDraftAt(settings, date("2026-11-03"), date("2026-10-01")),
    ).toEqual(date("2026-11-05T00:00:00Z"));
    expect(
      nextDraftAt(
        { ...settings, enabled: false },
        date("2026-11-03"),
        date("2026-10-01"),
      ),
    ).toBeNull();
    expect(
      nextDraftAt(
        { ...settings, cadence: "after_event" },
        date("2026-11-03"),
        date("2026-10-01"),
      ),
    ).toBeNull();
    expect(nextDraftAt(settings, date("2026-11-03"), null)).toBeNull();
    expect(
      nextDraftAt(settings, date("2026-11-05"), date("2026-10-01")),
    ).toEqual(date("2026-11-05"));
    expect(
      nextDraftAt(settings, date("2026-11-03"), date("2027-01-06")),
    ).toEqual(date("2027-02-05"));
    expect(
      nextDraftAt(
        { ...settings, cadence: "weekly", weekday: 7 },
        date("2026-11-02"),
        date("2026-10-01"),
      ),
    ).toEqual(date("2026-11-08"));
    expect(
      nextDraftAt(
        { ...settings, cadence: "biweekly", weekday: 3 },
        date("2026-10-28"),
        date("2026-10-01"),
      ),
    ).toEqual(date("2026-11-04"));
  });

  it("looks back since the last issue, or a fixed number of days", () => {
    const now = date("2026-11-07T10:00:00Z");
    expect(
      lookBackWindow("since_last_issue", date("2026-10-01T08:00:00Z"), now),
    ).toEqual({ since: date("2026-10-01T08:00:00Z"), until: now });
    for (const lookBack of ["since_last_issue", "days_30", "days_7"] as const) {
      expect(lookBackWindow(lookBack, null, now)).toEqual({
        since: date(
          lookBack === "days_7"
            ? "2026-10-31T10:00:00Z"
            : "2026-10-08T10:00:00Z",
        ),
        until: now,
      });
    }
  });
});
