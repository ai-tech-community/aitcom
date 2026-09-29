// The CSV download (ADR-0038): guests get 401, anyone but the organizer
// 404, the organizer the view they asked for, with headers in their
// language (the real message catalogue and translator) and caching
// switched off for personal data.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: null as null | { user: { id: string } },
  read: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: { fake: true } }));
vi.mock("@/server/better-auth/server", () => ({
  getSession: async () => m.session,
}));
vi.mock("@/server/events/organizer-attendees", () => ({
  readAttendeesForOrganizer: m.read,
}));
const { GET } = await import("./route");

function row(overrides: Record<string, unknown>) {
  return {
    registrationId: "r1",
    firstName: "Ada",
    lastName: "Lovelace",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    detailsShared: true,
    status: "registered",
    registeredAt: new Date("2026-10-01T10:05:00Z"),
    waitlistPosition: null,
    paymentStatus: null,
    communityMemberSince: null,
    pastEventsAttended: 0,
    profile: null,
    ...overrides,
  };
}

const DATA = {
  event: { id: 7, slug: "builders-night", timezone: "Europe/Amsterdam" },
  community: { slug: "builders", name: "Builders" },
  counts: {},
  rows: [
    row({}),
    row({
      registrationId: "r2",
      displayName: "Grace Hopper",
      status: "waitlisted",
      waitlistPosition: 1,
    }),
    row({
      registrationId: "r3",
      displayName: "Carl Cancel",
      status: "cancelled",
    }),
  ],
};

function get(query = "") {
  return GET(
    new Request(
      `https://app.test/api/events/builders-night/attendees.csv${query}`,
    ),
    { params: Promise.resolve({ slug: "builders-night" }) },
  );
}

async function lines(res: Response) {
  return (await res.text()).replace(/^﻿/, "").trimEnd().split("\r\n");
}

beforeEach(() => {
  m.session = { user: { id: "org-1" } };
  m.read.mockReset();
  m.read.mockResolvedValue(DATA);
});

describe("GET /api/events/[slug]/attendees.csv", () => {
  it("asks guests to sign in and reads nothing", async () => {
    m.session = null;
    const res = await get();
    expect(res.status).toBe(401);
    expect(m.read).not.toHaveBeenCalled();
  });

  it("is not found for anyone but the organizer", async () => {
    m.read.mockResolvedValue(null);
    const res = await get();
    expect(res.status).toBe(404);
    expect(m.read).toHaveBeenCalledWith({ fake: true }, "org-1", {
      slug: "builders-night",
    });
  });

  it("gives the organizer everyone still coming, as a private download", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="builders-night-attendees.csv"',
    );
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const [header, ...rest] = await lines(res);
    expect(header).toContain("Registered at (Europe/Amsterdam)");
    expect(rest.map((l) => l.split(",")[0])).toEqual([
      "Ada Lovelace",
      "Grace Hopper",
    ]);
  });

  it("downloads the view asked for", async () => {
    const res = await get("?view=cancelled");
    expect(res.headers.get("Content-Disposition")).toContain(
      "builders-night-attendees-cancelled.csv",
    );
    const [, ...rest] = await lines(res);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toMatch(/^Carl Cancel,.*,Cancelled,/);
  });

  it("writes Dutch headers and statuses when asked", async () => {
    const [header, ada] = await lines(await get("?locale=nl"));
    expect(header).toMatch(
      /^Naam,Voornaam,Achternaam,E-mail,Status,Aangemeld op \(Europe\/Amsterdam\)/,
    );
    expect(ada).toContain(",Aangemeld,");
  });

  it("falls back to English and the default view for unknown values", async () => {
    const res = await get("?locale=fr&view=everything");
    expect(res.headers.get("Content-Disposition")).toContain(
      '"builders-night-attendees.csv"',
    );
    const [header] = await lines(res);
    expect(header).toMatch(/^Name,First name/);
  });
});
