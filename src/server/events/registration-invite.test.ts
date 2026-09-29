import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_APP_URL: "https://app.test" },
}));

import type { EventIcsSource } from "@/lib/events/event-ics";
import { toRegistrationCalendarInvite } from "./registration-invite";

const NATIVE: EventIcsSource = {
  id: 7,
  slug: "builders-night",
  title: "Builders night",
  summary: null,
  date: "2026-11-02T00:00:00.000Z",
  startTime: "19:00",
  endTime: "22:00",
  timezone: "Europe/Amsterdam",
  location: "Amsterdam",
  sourceUrl: null,
  status: "published",
};
const ATTENDEE = { email: "ada@example.com", name: "Ada" };

/** Undo RFC 5545 line folding so a long line can be matched whole. */
function unfold(ics: string): string {
  return ics.replace(/\r\n /g, "");
}

describe("toRegistrationCalendarInvite", () => {
  it("builds an invite from AIT Community to the member for our own event", () => {
    const invite = toRegistrationCalendarInvite(NATIVE, ATTENDEE, "invite");
    expect(invite).toMatchObject({
      filename: "invite.ics",
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    });
    const ics = unfold(invite!.content);
    expect(ics).toContain("mailto:noreply@mailer.aitcommunity.org");
    expect(ics).toContain("mailto:ada@example.com");
    expect(ics).toContain("URL:https://app.test/events/builders-night");
  });

  it("builds the matching cancel", () => {
    const cancel = toRegistrationCalendarInvite(NATIVE, ATTENDEE, "cancel");
    expect(cancel).toMatchObject({
      filename: "cancel.ics",
      contentType: "text/calendar; charset=utf-8; method=CANCEL",
    });
  });

  it("sends no invite for an event run on another site", () => {
    const external = { ...NATIVE, sourceUrl: "https://lu.ma/abc" };
    expect(
      toRegistrationCalendarInvite(external, ATTENDEE, "invite"),
    ).toBeUndefined();
    expect(
      toRegistrationCalendarInvite(external, ATTENDEE, "cancel"),
    ).toBeUndefined();
  });
});
