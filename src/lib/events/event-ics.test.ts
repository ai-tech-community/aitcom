import { describe, expect, it } from "vitest";
import {
  buildEventIcs,
  eventIcsContentType,
  eventIcsUid,
  type EventIcsSource,
} from "./event-ics";

const MEETUP: EventIcsSource = {
  id: 42,
  slug: "ai-meetup",
  title: "AI meetup",
  summary: "Talks, pizza; demos",
  date: "2026-10-15T00:00:00.000Z",
  startTime: "18:00",
  endTime: "21:00",
  timezone: "Europe/Amsterdam",
  location: "Amsterdam, NL",
  sourceUrl: null,
  status: "published",
};

const APP_URL = "https://app.test";
const ORGANIZER = {
  name: "AIT Community",
  email: "noreply@mailer.aitcommunity.org",
};
const ATTENDEE = { email: "ada@example.com", name: "Ada Lovelace" };
const NOW = new Date("2026-09-29T10:00:00.000Z");

function lines(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("buildEventIcs", () => {
  it("publishes a plain calendar entry with no people on it", () => {
    const out = lines(
      buildEventIcs(MEETUP, { method: "publish", appUrl: APP_URL, now: NOW }),
    );
    expect(out).toContain("METHOD:PUBLISH");
    expect(out).toContain(`UID:${eventIcsUid(MEETUP)}`);
    expect(out).toContain("DTSTAMP:20260929T100000Z");
    expect(out).toContain("DTSTART;TZID=Europe/Amsterdam:20261015T180000");
    expect(out).toContain("DTEND;TZID=Europe/Amsterdam:20261015T210000");
    expect(out).toContain("SUMMARY:AI meetup");
    expect(out).toContain("LOCATION:Amsterdam\\, NL");
    expect(out).toContain("URL:https://app.test/events/ai-meetup");
    expect(out).toContain("STATUS:CONFIRMED");
    expect(out.some((l) => l.startsWith("ORGANIZER"))).toBe(false);
    expect(out.some((l) => l.startsWith("ATTENDEE"))).toBe(false);
  });

  it("invites one attendee from the organizer as an accepted participant", () => {
    const out = lines(
      buildEventIcs(MEETUP, {
        method: "invite",
        appUrl: APP_URL,
        organizer: ORGANIZER,
        attendee: ATTENDEE,
        now: NOW,
      }),
    );
    expect(out).toContain("METHOD:REQUEST");
    expect(out).toContain(
      'ORGANIZER;CN="AIT Community":mailto:noreply@mailer.aitcommunity.org',
    );
    expect(out).toContain(
      'ATTENDEE;CN="Ada Lovelace";ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:ada@example.com',
    );
    expect(out).toContain(`SEQUENCE:${Math.floor(NOW.getTime() / 1000)}`);
    expect(out).toContain("STATUS:CONFIRMED");
  });

  it("cancels the same calendar entry with a later sequence than the invite", () => {
    const invite = lines(
      buildEventIcs(MEETUP, {
        method: "invite",
        appUrl: APP_URL,
        organizer: ORGANIZER,
        attendee: ATTENDEE,
        now: NOW,
      }),
    );
    const cancel = lines(
      buildEventIcs(MEETUP, {
        method: "cancel",
        appUrl: APP_URL,
        organizer: ORGANIZER,
        attendee: ATTENDEE,
        now: new Date(NOW.getTime() + 60_000),
      }),
    );
    const seq = (out: string[]) =>
      Number(out.find((l) => l.startsWith("SEQUENCE:"))!.slice(9));

    expect(cancel).toContain("METHOD:CANCEL");
    expect(cancel).toContain("STATUS:CANCELLED");
    expect(cancel.find((l) => l.startsWith("UID:"))).toBe(
      invite.find((l) => l.startsWith("UID:")),
    );
    expect(seq(cancel)).toBeGreaterThan(seq(invite));
  });

  it("gives a date-only event an all-day start and no end", () => {
    const out = lines(
      buildEventIcs(
        { ...MEETUP, startTime: null, endTime: null },
        { method: "publish", appUrl: APP_URL, now: NOW },
      ),
    );
    expect(out).toContain("DTSTART;VALUE=DATE:20261015");
    expect(out.some((l) => l.startsWith("DTEND"))).toBe(false);
  });

  it("links an imported event to its source site", () => {
    const out = lines(
      buildEventIcs(
        { ...MEETUP, sourceUrl: "https://lu.ma/abc" },
        { method: "publish", appUrl: APP_URL, now: NOW },
      ),
    );
    expect(out).toContain("URL:https://lu.ma/abc");
  });

  it("keeps a quote in the attendee name from breaking the line", () => {
    const out = lines(
      buildEventIcs(MEETUP, {
        method: "invite",
        appUrl: APP_URL,
        organizer: ORGANIZER,
        attendee: { email: "a@b.c", name: 'Sam "the Man"' },
        now: NOW,
      }),
    );
    expect(out.find((l) => l.startsWith("ATTENDEE"))).toContain(
      "CN=\"Sam 'the Man'\";",
    );
  });

  it("folds long lines to 75 octets", () => {
    const ics = buildEventIcs(
      { ...MEETUP, title: "x".repeat(200) },
      { method: "publish", appUrl: APP_URL, now: NOW },
    );
    for (const line of ics.split("\r\n")) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});

describe("eventIcsContentType", () => {
  it("names the iTIP method so mail clients show an invite", () => {
    expect(eventIcsContentType("invite")).toBe(
      "text/calendar; charset=utf-8; method=REQUEST",
    );
    expect(eventIcsContentType("cancel")).toBe(
      "text/calendar; charset=utf-8; method=CANCEL",
    );
  });
});
