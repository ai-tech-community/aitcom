import { afterEach, describe, expect, it } from "vitest";
import { eventDetailDay, eventSummaryLine } from "./event-detail-when";

const TYPES = {
  types: {
    workshop: "Workshop",
    hackathon: "Hackathon",
    deep_dive: "Deep Dive",
    meetup: "Meetup",
  },
};

describe("eventDetailDay", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("keeps the event's day for a viewer or server west of UTC", () => {
    process.env.TZ = "America/Los_Angeles";
    // The old `new Date(date).getDate()` gave the 4th here.
    expect(new Date("2026-10-05T00:00:00.000Z").getDate()).toBe(4);
    expect(eventDetailDay({ date: "2026-10-05T00:00:00.000Z" }, "en")).toEqual({
      dateTime: "2026-10-05",
      endDateTime: null,
      month: "Oct",
      day: "05",
      year: "2026",
      label: "05 Oct 2026",
    });
  });

  it("keeps a date-only value and speaks Dutch", () => {
    process.env.TZ = "Pacific/Honolulu";
    expect(eventDetailDay({ date: "2026-10-05" }, "nl")).toMatchObject({
      month: "okt",
      day: "05",
      label: "05 okt 2026",
    });
  });

  it("degrades a corrupt date instead of throwing", () => {
    expect(eventDetailDay({ date: "soon" }, "en")).toEqual({
      dateTime: null,
      endDateTime: null,
      month: "",
      day: "--",
      year: "",
      label: "soon",
    });
  });

  it("shows the span when a later endDate is set", () => {
    expect(
      eventDetailDay(
        { date: "2026-10-20T12:00:00.000Z", endDate: "2026-10-21" },
        "en",
      ),
    ).toMatchObject({
      dateTime: "2026-10-20",
      endDateTime: "2026-10-21",
      label: "20–21 Oct 2026",
    });
    expect(
      eventDetailDay(
        { date: "2026-11-09", endDate: "2026-11-12T12:00:00.000Z" },
        "nl",
      ).label,
    ).toBe("09–12 nov 2026");
  });

  it("keeps a single day when endDate is missing or the same day", () => {
    expect(eventDetailDay({ date: "2026-10-22" }, "en").label).toBe(
      "22 Oct 2026",
    );
    expect(
      eventDetailDay(
        { date: "2026-10-22", endDate: "2026-10-22T00:00:00.000Z" },
        "en",
      ),
    ).toMatchObject({ endDateTime: null, label: "22 Oct 2026" });
  });
});

describe("eventSummaryLine", () => {
  it("names type, day and place without English glue", () => {
    expect(
      eventSummaryLine(
        {
          type: "deep_dive",
          date: "2026-10-05T00:00:00.000Z",
          location: "Pakhuis de Zwijger",
        },
        "nl",
        TYPES,
      ),
    ).toBe("Deep Dive · 05 okt 2026 · Pakhuis de Zwijger");
  });

  it("names a multi-day span when endDate is set", () => {
    expect(
      eventSummaryLine(
        {
          type: "meetup",
          date: "2026-10-07",
          endDate: "2026-10-08",
          location: "Taets Art & Event Park",
        },
        "en",
        TYPES,
      ),
    ).toBe("Meetup · 07–08 Oct 2026 · Taets Art & Event Park");
  });
});
