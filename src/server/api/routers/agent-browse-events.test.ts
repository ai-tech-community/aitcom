// Router-level test: the agent API lists upcoming events with the same
// "is it over" rule as every event page, so an event later today stays.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const payload = { find: vi.fn() };

vi.mock("@/server/db", () => ({
  db: {
    update: () => {
      const chain: Record<string, unknown> = {};
      chain.set = () => chain;
      chain.where = () => Promise.resolve();
      return chain;
    },
    query: { communities: { findFirst: async () => undefined } },
  },
}));
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
vi.mock("@/server/agent/api-key", () => ({
  validateApiKey: async () => ({
    agentId: "agent-1",
    ownerId: "owner-1",
    scopes: ["read"],
  }),
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => payload }));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function agentCaller() {
  return createCaller({
    db: mockedDb,
    session: null,
    headers: new Headers({ authorization: "Bearer test-key" }),
  });
}

const NOW = new Date("2026-09-27T10:00:00.000Z");

function event(id: number, date: string, startTime: string | null) {
  return {
    id,
    title: `Event ${id}`,
    type: "meetup",
    date,
    startTime,
    endTime: null,
    timezone: "Europe/Amsterdam",
    location: "Amsterdam",
    maxAttendees: null,
    description: null,
  };
}

describe("agent.browseEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    payload.find.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps an event later today and drops yesterday's", async () => {
    payload.find.mockResolvedValue({
      docs: [
        event(1, "2026-09-26T00:00:00.000Z", "19:00"),
        // Stored 00:00 UTC today: the old `date >= now` query left it out.
        event(2, "2026-09-27T00:00:00.000Z", "19:00"),
        event(3, "2026-09-28T00:00:00.000Z", "09:00"),
      ],
    });

    const result = await agentCaller().agent.browseEvents({ limit: 10 });
    expect(result.map((e) => e.id)).toEqual([2, 3]);

    const [args] = payload.find.mock.calls[0] as [
      { where: { and: Record<string, unknown>[] }; limit: number },
    ];
    // The query floor reaches back two days so today's event is fetched.
    expect(args.where.and).toContainEqual({
      date: { greater_than_equal: "2026-09-25T10:00:00.000Z" },
    });
    expect(args.limit).toBeGreaterThan(10);
  });

  it("returns at most the requested number", async () => {
    payload.find.mockResolvedValue({
      docs: [event(1, "2026-09-28", "09:00"), event(2, "2026-09-29", "09:00")],
    });
    const result = await agentCaller().agent.browseEvents({ limit: 1 });
    expect(result.map((e) => e.id)).toEqual([1]);
  });
});
