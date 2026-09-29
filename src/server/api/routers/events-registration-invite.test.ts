// Router-level test: registering for an event AIT Community runs emails a
// calendar invite; an event run on another site cannot be registered here
// (the page sends people to its source); a waitlisted member gets no invite;
// cancelling a seat withdraws the invite.
import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { findByID: vi.fn() };
const sendRegistrationConfirmation = vi.fn();
const sendCancellationConfirmation = vi.fn();
const sendWaitlistPromotion = vi.fn();

/** Rows each awaited db chain resolves to, in call order. */
const dbResults: unknown[][] = [];
const inserted: unknown[] = [];

function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "orderBy", "set", "returning"]) {
    c[m] = () => c;
  }
  c.values = (row: unknown) => {
    inserted.push(row);
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    resolve(dbResults.shift() ?? []);
  return c;
}
const fakeDb = {
  select: () => chain(),
  insert: () => chain(),
  update: () => chain(),
};

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));
vi.mock("@/server/mollie", () => ({ getMollie: () => null }));
vi.mock("@/server/agent/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/server/email", () => ({
  sendRegistrationConfirmation,
  sendCancellationConfirmation,
  sendWaitlistPromotion,
  EMAIL_SENDER: {
    name: "AIT Community",
    email: "noreply@mailer.aitcommunity.org",
  },
}));

const { createCaller } = await import("@/server/api/root");

function memberCaller() {
  return createCaller({
    db: fakeDb as never,
    session: {
      user: { id: "u1", name: "Ada", email: "ada@example.com" },
      session: { id: "s1" },
    } as never,
    headers: new Headers(),
  });
}

const NATIVE_EVENT = {
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
  maxAttendees: 10,
  price: 0,
  communityId: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  dbResults.length = 0;
  inserted.length = 0;
});

describe("events.register", () => {
  it("emails our own event's confirmation with a calendar invite", async () => {
    payload.findByID.mockResolvedValue(NATIVE_EVENT);
    dbResults.push(
      [], // no existing registration
      [{ count: 0 }], // seats taken
      [{ id: 1, status: "registered" }], // inserted row
      [], // no member profile: no XP
    );

    const res = await memberCaller().events.register({ eventId: 7 });
    expect(res.registration.status).toBe("registered");

    await vi.waitFor(() =>
      expect(sendRegistrationConfirmation).toHaveBeenCalledTimes(1),
    );
    const [to, , , invite] = sendRegistrationConfirmation.mock.calls[0]!;
    expect(to).toBe("ada@example.com");
    expect(invite).toMatchObject({
      filename: "invite.ics",
      contentType: "text/calendar; charset=utf-8; method=REQUEST",
    });
  });

  it("refuses an event run on another site and emails nothing", async () => {
    payload.findByID.mockResolvedValue({
      ...NATIVE_EVENT,
      sourceUrl: "https://lu.ma/abc",
    });
    dbResults.push([]); // no existing registration

    await expect(
      memberCaller().events.register({ eventId: 7 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(inserted).toHaveLength(0);
    expect(sendRegistrationConfirmation).not.toHaveBeenCalled();
  });

  it("sends a waitlisted member no confirmation or invite", async () => {
    payload.findByID.mockResolvedValue({ ...NATIVE_EVENT, maxAttendees: 1 });
    dbResults.push(
      [],
      [{ count: 1 }], // full
      [{ id: 2, status: "waitlisted" }],
    );

    const res = await memberCaller().events.register({ eventId: 7 });
    expect(res.registration.status).toBe("waitlisted");

    await new Promise((r) => setTimeout(r, 0));
    expect(sendRegistrationConfirmation).not.toHaveBeenCalled();
  });
});

describe("events.cancelRegistration", () => {
  it("withdraws the calendar invite when a seat is cancelled", async () => {
    payload.findByID.mockResolvedValue(NATIVE_EVENT);
    dbResults.push(
      [{ status: "registered" }], // active registration
      [], // update
      [], // nobody waitlisted
    );

    await memberCaller().events.cancelRegistration({ eventId: 7 });

    await vi.waitFor(() =>
      expect(sendCancellationConfirmation).toHaveBeenCalledTimes(1),
    );
    expect(sendCancellationConfirmation.mock.calls[0]![3]).toMatchObject({
      filename: "cancel.ics",
      contentType: "text/calendar; charset=utf-8; method=CANCEL",
    });
  });

  it("sends no calendar cancel to a member who only waited", async () => {
    payload.findByID.mockResolvedValue(NATIVE_EVENT);
    dbResults.push([{ status: "waitlisted" }], [], []);

    await memberCaller().events.cancelRegistration({ eventId: 7 });

    await vi.waitFor(() =>
      expect(sendCancellationConfirmation).toHaveBeenCalledTimes(1),
    );
    expect(sendCancellationConfirmation.mock.calls[0]![3]).toBeUndefined();
  });
});
