// A private or invite-only event stays off the public registration reads
// and cannot be joined by id.
import { beforeEach, describe, expect, it, vi } from "vitest";

const payload = { findByID: vi.fn() };
const findCommunity = vi.fn();
const findMembership = vi.fn();
const select = vi.fn();

function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit", "innerJoin", "leftJoin"]) {
    c[m] = () => c;
  }
  c.then = (resolve: (value: unknown[]) => unknown) => resolve(rows);
  return c;
}

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
  sendRegistrationConfirmation: vi.fn(),
  sendCancellationConfirmation: vi.fn(),
  sendWaitlistPromotion: vi.fn(),
  EMAIL_SENDER: { name: "AIT Community", email: "noreply@example.test" },
}));

const { createCaller } = await import("@/server/api/root");

const db = {
  select,
  query: {
    communities: { findFirst: findCommunity },
    communityMemberships: { findFirst: findMembership },
  },
};

function caller(userId: string | null) {
  return createCaller({
    db: db as never,
    session: userId
      ? ({
          user: { id: userId, name: "Ada", email: "ada@example.com" },
          session: { id: "s1" },
        } as never)
      : null,
    headers: new Headers(),
  });
}

const HIDDEN_EVENT = {
  id: 7,
  communityId: "studio",
  title: "Studio night",
  slug: "studio-night",
  sourceUrl: null,
  status: "published",
  registrationQuestions: [],
  maxAttendees: null,
  price: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  payload.findByID.mockResolvedValue(HIDDEN_EVENT);
  findCommunity.mockResolvedValue({
    id: "studio",
    slug: "ait-demo-studio",
    isListedInDirectory: false,
    joinPolicy: "invite_only",
  });
  findMembership.mockResolvedValue(null);
  select.mockImplementation(() => chain([]));
});

describe("private event registration surfaces", () => {
  it("hides the attendee count and names from a guest", async () => {
    const guest = caller(null);
    await expect(guest.events.registrationCount({ eventId: 7 })).resolves.toBe(
      0,
    );
    await expect(guest.events.getAttendees({ eventId: 7 })).resolves.toEqual(
      [],
    );
    expect(select).not.toHaveBeenCalled();
  });

  it("refuses registration from a signed-in non-member", async () => {
    await expect(
      caller("outsider").events.register({ eventId: 7 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(select).not.toHaveBeenCalled();
  });

  it("shows the count to an active member", async () => {
    findMembership.mockResolvedValue({ communityId: "studio" });
    select.mockImplementation(() => chain([{ count: 4 }]));
    await expect(
      caller("member-1").events.registrationCount({ eventId: 7 }),
    ).resolves.toBe(4);
    expect(select).toHaveBeenCalled();
  });
});
