// Router-level test: the attendee list and its link are the event
// organizer's alone (ADR-0038), everyone else gets NOT_FOUND / null, and the
// rows carry the privacy rule from the read model.
import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { findByID: vi.fn(), find: vi.fn() };
const dbResults: unknown[][] = [];

function chain(): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of [
    "from",
    "where",
    "limit",
    "orderBy",
    "innerJoin",
    "leftJoin",
    "groupBy",
  ]) {
    c[m] = () => c;
  }
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    resolve(dbResults.shift() ?? []);
  return c;
}
const findCommunity = vi.fn();
const findMembership = vi.fn();
const updates: unknown[] = [];
const logActivity = vi.fn();
const fakeDb = {
  select: () => chain(),
  update: () => {
    const c = chain();
    c.set = (values: unknown) => {
      updates.push(values);
      return c;
    };
    return c;
  },
  query: {
    communities: { findFirst: findCommunity },
    communityMemberships: { findFirst: findMembership },
  },
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
vi.mock("@/server/agent/activity", () => ({ logActivity }));

const { createCaller } = await import("@/server/api/root");

function caller(userId: string) {
  return createCaller({
    db: fakeDb as never,
    session: {
      user: { id: userId, name: userId, email: `${userId}@example.test` },
      session: { id: "s1" },
    } as never,
    headers: new Headers(),
  });
}

const EVENT = {
  id: 7,
  slug: "builders-night",
  title: "Builders night",
  date: "2026-11-02T00:00:00.000Z",
  startTime: "19:00",
  endTime: "22:00",
  timezone: "Europe/Amsterdam",
  communityId: "c-1",
  organizerId: "org-1",
  sourceUrl: null,
  maxAttendees: 40,
  price: 0,
};

function registration(overrides: Record<string, unknown>) {
  return {
    registrationId: "r1",
    userId: "u1",
    status: "registered",
    registeredAt: new Date("2026-10-01T10:00:00Z"),
    paymentStatus: null,
    organizerNoticeAt: new Date("2026-10-01T10:00:00Z"),
    name: "Ada",
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    displayName: "Ada",
    isPublic: true,
    company: "Engines",
    linkedinUrl: null,
    githubUrl: null,
    websiteUrl: null,
    experienceLevel: null,
    skills: [],
    interests: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbResults.length = 0;
  updates.length = 0;
  payload.findByID.mockResolvedValue(EVENT);
  payload.find.mockResolvedValue({ docs: [{ id: 3 }, { id: 4 }] });
  findCommunity.mockResolvedValue({
    id: "c-1",
    name: "Builders",
    slug: "builders",
  });
  findMembership.mockResolvedValue({ role: "member", status: "active" });
});

describe("events.attendees", () => {
  it("gives the organizer every registration, with the privacy rule applied", async () => {
    dbResults.push(
      [
        registration({}),
        registration({
          registrationId: "r2",
          userId: "u2",
          status: "waitlisted",
          organizerNoticeAt: null, // registered before the notice
          email: "grace@example.com",
          firstName: "Grace",
          lastName: "Hopper",
        }),
        registration({
          registrationId: "r3",
          userId: "u3",
          status: "waitlisted",
          isPublic: false,
          email: "linus@example.com",
          firstName: "Linus",
          lastName: "T",
        }),
      ],
      [{ userId: "u1", joinedAt: new Date("2026-01-01T00:00:00Z") }],
      [{ userId: "u1", attended: 2 }],
    );

    const res = await caller("org-1").events.attendees({ eventId: 7 });

    expect(res.counts).toMatchObject({ registered: 1, waitlisted: 2 });
    expect(res.event).toMatchObject({ maxAttendees: 40, isPaid: false });
    const [ada, grace, linus] = res.rows;
    expect(ada).toMatchObject({
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      pastEventsAttended: 2,
      profile: { company: "Engines" },
    });
    expect(grace).toMatchObject({
      email: null,
      detailsShared: false,
      profile: null,
      waitlistPosition: 1,
    });
    expect(linus).toMatchObject({
      email: "linus@example.com",
      profile: null,
      waitlistPosition: 2,
      pastEventsAttended: 0,
      communityMemberSince: null,
    });
    // Past attendance counts only this community's earlier events.
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          and: [
            { communityId: { equals: "c-1" } },
            { date: { less_than: EVENT.date } },
          ],
        },
      }),
    );
  });

  it.each([
    [
      "a community admin who is not the organizer",
      "admin-1",
      { role: "admin", status: "active" },
    ],
    ["the organizer after leaving", "org-1", undefined],
    ["another member", "m-1", { role: "member", status: "active" }],
  ])("hides the list from %s", async (_who, userId, membership) => {
    findMembership.mockResolvedValue(membership);
    await expect(
      caller(userId).events.attendees({ eventId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("hides the list of an external event", async () => {
    payload.findByID.mockResolvedValue({
      ...EVENT,
      sourceUrl: "https://lu.ma/x",
    });
    await expect(
      caller("org-1").events.attendees({ eventId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("events.attendeesLink", () => {
  it("gives the organizer the page address", async () => {
    await expect(
      caller("org-1").events.attendeesLink({ eventId: 7 }),
    ).resolves.toBe("/communities/builders/events/builders-night/attendees");
  });

  it("gives anyone else nothing, without loading their membership", async () => {
    await expect(
      caller("m-1").events.attendeesLink({ eventId: 7 }),
    ).resolves.toBeNull();
    expect(findMembership).not.toHaveBeenCalled();
  });

  it("gives an organizer who left nothing", async () => {
    findMembership.mockResolvedValue(undefined);
    await expect(
      caller("org-1").events.attendeesLink({ eventId: 7 }),
    ).resolves.toBeNull();
  });
});

describe("events.setCheckedIn", () => {
  const REGISTERED = {
    id: "r1",
    eventId: 7,
    status: "registered",
    checkedInAt: null,
  };

  it("checks a registered member in for the organizer", async () => {
    dbResults.push([REGISTERED]);

    const res = await caller("org-1").events.setCheckedIn({
      registrationId: "r1",
      checkedIn: true,
    });

    expect(res).toMatchObject({ status: "attended" });
    expect(updates).toEqual([
      { status: "attended", checkedInAt: expect.any(Date) },
    ]);
    expect(logActivity).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ action: "event.check_in", targetId: "7" }),
    );
  });

  it("undoes a check-in", async () => {
    dbResults.push([
      { ...REGISTERED, status: "attended", checkedInAt: new Date() },
    ]);

    await caller("org-1").events.setCheckedIn({
      registrationId: "r1",
      checkedIn: false,
    });

    expect(updates).toEqual([{ status: "registered", checkedInAt: null }]);
  });

  it("refuses to check in someone on the waitlist", async () => {
    dbResults.push([{ ...REGISTERED, status: "waitlisted" }]);

    await expect(
      caller("org-1").events.setCheckedIn({
        registrationId: "r1",
        checkedIn: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(updates).toHaveLength(0);
  });

  it("is not found for anyone but the organizer", async () => {
    findMembership.mockResolvedValue({ role: "admin", status: "active" });
    dbResults.push([REGISTERED]);

    await expect(
      caller("admin-1").events.setCheckedIn({
        registrationId: "r1",
        checkedIn: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updates).toHaveLength(0);
  });

  it("is not found for a registration that does not exist", async () => {
    dbResults.push([]);

    await expect(
      caller("org-1").events.setCheckedIn({
        registrationId: "nope",
        checkedIn: true,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
