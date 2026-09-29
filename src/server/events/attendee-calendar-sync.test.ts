import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEventChangedEmail = vi.fn();
const sendEventCancelledEmail = vi.fn();

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://app.test" } }));
vi.mock("@/server/email", () => ({
  sendEventChangedEmail,
  sendEventCancelledEmail,
  EMAIL_SENDER: {
    name: "AIT Community",
    email: "noreply@mailer.aitcommunity.org",
  },
}));

const { attendeeCalendarChange, notifyAttendeesOfEventChange } =
  await import("./attendee-calendar-sync");

const EVENT = {
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
  status: "published" as const,
};

// attendeeCalendarChange(liveBefore, liveAfter)
describe("attendeeCalendarChange", () => {
  it.each([
    ["time", { startTime: "20:00" }],
    ["end time", { endTime: "23:00" }],
    ["day", { date: "2026-11-03T00:00:00.000Z" }],
    ["zone", { timezone: "Europe/London" }],
    ["place", { location: "Utrecht" }],
    ["name", { title: "Builders night #2" }],
  ])("updates invites when the %s moves", (_what, patch) => {
    expect(attendeeCalendarChange(EVENT, { ...EVENT, ...patch })).toBe(
      "update",
    );
  });

  it("cancels invites when the event becomes cancelled", () => {
    expect(
      attendeeCalendarChange(EVENT, { ...EVENT, status: "cancelled" }),
    ).toBe("cancel");
  });

  it("says nothing when an already cancelled event is saved again", () => {
    const cancelled = { ...EVENT, status: "cancelled" as const };
    expect(
      attendeeCalendarChange(cancelled, { ...cancelled, location: "Utrecht" }),
    ).toBeNull();
  });

  it("says nothing when a cancelled event is put back on", () => {
    const cancelled = { ...EVENT, status: "cancelled" as const };
    expect(attendeeCalendarChange(cancelled, EVENT)).toBeNull();
  });

  it("says nothing for edits a calendar does not show", () => {
    expect(
      attendeeCalendarChange(EVENT, { ...EVENT, summary: "New blurb" }),
    ).toBeNull();
    expect(
      attendeeCalendarChange(EVENT, { ...EVENT, slug: "renamed" }),
    ).toBeNull();
  });

  it("treats a missing time and an empty one alike", () => {
    expect(
      attendeeCalendarChange(
        { ...EVENT, endTime: undefined },
        { ...EVENT, endTime: null },
      ),
    ).toBeNull();
  });

  it("leaves events run on another site to that site", () => {
    const external = { ...EVENT, sourceUrl: "https://lu.ma/abc" };
    expect(
      attendeeCalendarChange(external, { ...external, startTime: "20:00" }),
    ).toBeNull();
    expect(
      attendeeCalendarChange(external, { ...external, status: "cancelled" }),
    ).toBeNull();
  });

  it("says nothing when either live row is missing", () => {
    expect(attendeeCalendarChange(undefined, EVENT)).toBeNull();
    expect(attendeeCalendarChange(EVENT, null)).toBeNull();
  });
});

describe("notifyAttendeesOfEventChange", () => {
  function fakeDb(rows: { name: string | null; email: string }[]) {
    const c = {
      from: () => c,
      innerJoin: () => c,
      where: () => Promise.resolve(rows),
    };
    return { select: () => c } as never;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    sendEventChangedEmail.mockResolvedValue(true);
    sendEventCancelledEmail.mockResolvedValue(true);
  });

  it("sends every seat holder an updated invite", async () => {
    const result = await notifyAttendeesOfEventChange(
      { ...EVENT, startTime: "20:00" },
      "update",
      fakeDb([
        { name: "Ada", email: "ada@example.com" },
        { name: null, email: "grace@example.com" },
      ]),
    );

    expect(result).toEqual({ attendees: 2, emailed: 2 });
    expect(sendEventCancelledEmail).not.toHaveBeenCalled();
    const [to, name, data, invite] = sendEventChangedEmail.mock.calls[1]!;
    expect(to).toBe("grace@example.com");
    expect(name).toBe("there");
    expect(data).toMatchObject({ eventTitle: "Builders night" });
    expect(invite).toMatchObject({
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    });
    expect(invite.content).toContain(
      "DTSTART;TZID=Europe/Amsterdam:20261102T200000",
    );
  });

  it("sends every seat holder a calendar cancel", async () => {
    await notifyAttendeesOfEventChange(
      { ...EVENT, status: "cancelled" },
      "cancel",
      fakeDb([{ name: "Ada", email: "ada@example.com" }]),
    );

    expect(sendEventChangedEmail).not.toHaveBeenCalled();
    expect(sendEventCancelledEmail.mock.calls[0]![3]).toMatchObject({
      contentType: "text/calendar; charset=utf-8; method=CANCEL",
    });
  });

  it("keeps going when one send fails", async () => {
    sendEventChangedEmail
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(true);
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await notifyAttendeesOfEventChange(
      EVENT,
      "update",
      fakeDb([
        { name: "Ada", email: "ada@example.com" },
        { name: "Grace", email: "grace@example.com" },
      ]),
    );

    expect(result).toEqual({ attendees: 2, emailed: 1 });
    expect(sendEventChangedEmail).toHaveBeenCalledTimes(2);
    errors.mockRestore();
  });
});
