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
      month: "",
      day: "--",
      year: "",
      label: "soon",
    });
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
});
