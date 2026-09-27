import { afterEach, describe, expect, it } from "vitest";
import { toEventEmailData, type EventEmailSource } from "./event-email-data";

const WORKSHOP: EventEmailSource = {
  title: "Prompting workshop",
  date: "2026-07-29T00:00:00.000Z",
  startTime: null,
  endTime: null,
  timezone: "America/Los_Angeles",
  location: "Online",
  slug: "prompting-workshop",
};

describe("toEventEmailData", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it("gives a date-only event its own day and no time", () => {
    process.env.TZ = "Pacific/Honolulu";
    expect(toEventEmailData(WORKSHOP)).toEqual({
      eventTitle: "Prompting workshop",
      eventDate: "29 Jul 2026",
      eventTime: null,
      eventLocation: "Online",
      eventSlug: "prompting-workshop",
    });
  });

  it("names the time in the event's zone", () => {
    expect(
      toEventEmailData({ ...WORKSHOP, startTime: "09:00", endTime: "12:00" })
        .eventTime,
    ).toBe("09:00–12:00 PDT (America/Los_Angeles)");
  });
});
