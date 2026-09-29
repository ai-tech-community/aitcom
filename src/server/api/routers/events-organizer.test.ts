// Router-level test for the event organizer (ADR-0038): the create paths
// record who runs the event; the owner or the current organizer can hand it
// over to an active member; owners and admins see who organizes what.
import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = {
  findByID: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
};
const logActivity = vi.fn();

/** Rows each awaited select/insert chain resolves to, in call order. */
const dbResults: unknown[][] = [];
const inserted: { table: unknown; row: unknown }[] = [];

function chain(table?: unknown): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const m of [
    "from",
    "where",
    "limit",
    "orderBy",
    "innerJoin",
    "leftJoin",
    "set",
    "returning",
  ]) {
    c[m] = () => c;
  }
  c.values = (row: unknown) => {
    inserted.push({ table, row });
    return c;
  };
  c.then = (resolve: (rows: unknown[]) => unknown) =>
    resolve(dbResults.shift() ?? []);
  return c;
}

const findCommunity = vi.fn();
const findMembership = vi.fn();
const fakeDb = {
  select: () => chain(),
  insert: (table: unknown) => chain(table),
  update: () => chain(),
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
const { notifications } = await import("@/server/db/schema");

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

const COMMUNITY = { id: "c-1", name: "Builders", slug: "builders" };
const EVENT = {
  id: 7,
  title: "Builders night",
  communityId: "c-1",
  organizerId: "org-1",
  sourceUrl: null,
};

/** Memberships by user id for this test. */
function memberships(byUser: Record<string, { role: string; status: string }>) {
  findMembership.mockImplementation(async () => {
    // The router asks for the actor first, then (setOrganizer) the target.
    const next = membershipQueue.shift();
    return next === undefined ? undefined : byUser[next];
  });
}
let membershipQueue: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  dbResults.length = 0;
  inserted.length = 0;
  membershipQueue = [];
  findCommunity.mockResolvedValue(COMMUNITY);
  payload.findByID.mockResolvedValue(EVENT);
  payload.update.mockResolvedValue({});
});

describe("events.setOrganizer", () => {
  const ROLES = {
    "owner-1": { role: "owner", status: "active" },
    "org-1": { role: "member", status: "active" },
    "admin-1": { role: "admin", status: "active" },
    "m-2": { role: "member", status: "active" },
    "pending-1": { role: "member", status: "pending_approval" },
  };

  it("lets the owner hand the event to an active member", async () => {
    memberships(ROLES);
    membershipQueue = ["owner-1", "m-2"];

    const res = await caller("owner-1").events.setOrganizer({
      eventId: 7,
      userId: "m-2",
    });

    expect(res).toEqual({ organizerId: "m-2", changed: true });
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "events",
        id: 7,
        data: { organizerId: "m-2" },
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({
        action: "event.organizer_change",
        metadata: expect.objectContaining({ from: "org-1", to: "m-2" }),
      }),
    );
    const note = inserted.find((i) => i.table === notifications);
    expect(note?.row).toMatchObject({
      userId: "m-2",
      type: "event_organizer",
    });
  });

  it("lets the current organizer hand it over", async () => {
    memberships(ROLES);
    membershipQueue = ["org-1", "m-2"];

    await expect(
      caller("org-1").events.setOrganizer({ eventId: 7, userId: "m-2" }),
    ).resolves.toMatchObject({ changed: true });
  });

  it("refuses an admin who does not organize the event", async () => {
    memberships(ROLES);
    membershipQueue = ["admin-1"];

    await expect(
      caller("admin-1").events.setOrganizer({ eventId: 7, userId: "admin-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("refuses a new organizer who is not an active member", async () => {
    memberships(ROLES);
    membershipQueue = ["owner-1", "pending-1"];

    await expect(
      caller("owner-1").events.setOrganizer({
        eventId: 7,
        userId: "pending-1",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("changes nothing when the organizer stays the same", async () => {
    memberships(ROLES);
    membershipQueue = ["owner-1"];

    await expect(
      caller("owner-1").events.setOrganizer({ eventId: 7, userId: "org-1" }),
    ).resolves.toEqual({ organizerId: "org-1", changed: false });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("sends no notification when you take the event yourself", async () => {
    memberships(ROLES);
    membershipQueue = ["owner-1", "owner-1"];

    await caller("owner-1").events.setOrganizer({
      eventId: 7,
      userId: "owner-1",
    });
    expect(inserted.find((i) => i.table === notifications)).toBeUndefined();
  });

  it("hides an event outside a community", async () => {
    payload.findByID.mockResolvedValue({ ...EVENT, communityId: null });

    await expect(
      caller("owner-1").events.setOrganizer({ eventId: 7, userId: "m-2" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("events.communityEventOrganizers", () => {
  beforeEach(() => {
    payload.find.mockResolvedValue({
      docs: [
        { id: 7, organizerId: "org-1", sourceUrl: null },
        { id: 8, organizerId: null, sourceUrl: null },
        { id: 9, organizerId: "x", sourceUrl: "https://lu.ma/abc" },
        { id: 10, organizerId: "admin-1", sourceUrl: "" },
      ],
    });
  });

  it("shows nothing to a member who is not an owner or admin", async () => {
    findMembership.mockResolvedValue({ role: "member", status: "active" });

    await expect(
      caller("m-2").events.communityEventOrganizers({
        communitySlug: "builders",
      }),
    ).resolves.toEqual([]);
    expect(payload.find).not.toHaveBeenCalled();
  });

  it("lists native events with names; admins change only their own", async () => {
    findMembership.mockResolvedValue({ role: "admin", status: "active" });
    dbResults.push([
      { userId: "org-1", name: "Ada L", displayName: "Ada" },
      { userId: "admin-1", name: "Grace H", displayName: null },
    ]);

    const rows = await caller("admin-1").events.communityEventOrganizers({
      communitySlug: "builders",
    });

    expect(rows).toEqual([
      {
        eventId: 7,
        organizer: { userId: "org-1", name: "Ada" },
        canChange: false,
      },
      { eventId: 8, organizer: null, canChange: false },
      {
        eventId: 10,
        organizer: { userId: "admin-1", name: "Grace H" },
        canChange: true,
      },
    ]);
  });

  it("lets the owner change every event", async () => {
    findMembership.mockResolvedValue({ role: "owner", status: "active" });
    dbResults.push([]);

    const rows = await caller("owner-1").events.communityEventOrganizers({
      communitySlug: "builders",
    });

    expect(rows.every((r) => r.canChange)).toBe(true);
    expect(rows.find((r) => r.eventId === 7)?.organizer?.name).toBe(
      "Former member",
    );
  });
});

describe("create paths record the organizer", () => {
  const INPUT = {
    communitySlug: "builders",
    title: "Builders night",
    type: "meetup" as const,
    date: "2026-11-02",
    location: "Amsterdam",
  };

  beforeEach(() => {
    payload.create.mockResolvedValue({ id: 11, slug: "builders-night" });
    payload.find.mockResolvedValue({ docs: [] });
  });

  it("createEvent makes the admin the organizer", async () => {
    findMembership.mockResolvedValue({ role: "admin", status: "active" });

    await caller("admin-1").events.createEvent(INPUT);

    expect(payload.create.mock.calls[0]![0].data).toMatchObject({
      organizerId: "admin-1",
    });
  });

  it("submitEvent makes the submitting member the organizer", async () => {
    findMembership.mockResolvedValue({ role: "member", status: "active" });

    await caller("m-2").events.submitEvent(INPUT);

    expect(payload.create.mock.calls[0]![0].data).toMatchObject({
      organizerId: "m-2",
      submittedBy: "m-2",
    });
  });
});
