import { describe, it, expect, vi } from "vitest";

// Stub out server-side modules that events.ts transitively imports
// so we can unit-test the pure buildEventPayloadData helper in isolation.
vi.mock("@/server/db", () => ({}));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));
vi.mock("@/server/better-auth/config", () => ({}));
vi.mock("@/server/api/trpc", () => {
  const chainable: Record<string, unknown> = {};
  chainable.input = () => chainable;
  chainable.query = () => ({});
  chainable.mutation = () => ({});
  return {
    createTRPCRouter: (routes: unknown) => routes,
    protectedProcedure: chainable,
    publicProcedure: chainable,
  };
});
vi.mock("@/server/db/schema", () => ({}));
vi.mock("@/server/luma/crypto", () => ({ decryptApiKey: vi.fn() }));
vi.mock("@/server/luma/client", () => ({ getCalendarEvents: vi.fn() }));
vi.mock("@/server/luma/cache", () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
}));
vi.mock("@/server/luma/normalize", () => ({ normalizeLumaEvent: vi.fn() }));
vi.mock("@/lib/gamification", () => ({ awardXp: vi.fn(), XP_AMOUNTS: {} }));
vi.mock("@/server/agent/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/server/email", () => ({
  sendRegistrationConfirmation: vi.fn(),
  sendCancellationConfirmation: vi.fn(),
  sendWaitlistPromotion: vi.fn(),
}));
vi.mock("@/server/mollie", () => ({ getMollie: vi.fn() }));
vi.mock("@/env", () => ({ env: {} }));
vi.mock("@/server/challenge-engine/lexical", () => ({
  plainTextToLexical: (s: string) => s,
}));

import { buildEventPayloadData } from "./events";

describe("buildEventPayloadData", () => {
  const base = {
    title: "AI Builders Meetup",
    type: "meetup" as const,
    date: "2026-06-12",
    location: "Amsterdam",
  };

  it("passes coverImage media id straight through", () => {
    const data = buildEventPayloadData({ ...base, coverImage: 42 });
    expect(data.coverImage).toBe(42);
  });

  it("leaves coverImage undefined when not provided", () => {
    const data = buildEventPayloadData(base);
    expect(data.coverImage).toBeUndefined();
  });
});
