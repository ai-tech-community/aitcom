// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  community: vi.fn(),
  membership: vi.fn(),
  load: vi.fn(),
  magazine: vi.fn(),
  payload: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/server/inbox/dm", () => ({ sendDirectMessage: vi.fn() }));
vi.mock("@/server/communities/statistics-queries", () => ({
  loadCommunityStatistics: fake.load,
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: fake.payload }));
vi.mock("@/server/magazines/stats/community-stats", () => ({
  loadCommunityMagazineStats: fake.magazine,
}));

import { insightsRouter } from "./insights";
import type { db as _db } from "@/server/db";

const database = {
  query: {
    communities: { findFirst: fake.community },
    communityMemberships: { findFirst: fake.membership },
  },
} as unknown as typeof _db;
function caller(signedIn = true) {
  return insightsRouter.createCaller({
    db: database,
    headers: new Headers(),
    session: signedIn ? ({ user: { id: "viewer" } } as never) : null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.community.mockResolvedValue({
    id: "resolved-community",
    slug: "builders",
  });
  fake.membership.mockResolvedValue({ role: "owner", status: "active" });
  fake.load.mockResolvedValue({ aggregate: true });
  fake.payload.mockResolvedValue({ marker: "payload" });
  fake.magazine.mockResolvedValue({ magazine: null });
});

describe("insights.magazinePerformance", () => {
  it.each(["owner", "admin"])(
    "serves an active %s with resolved community scope and defaults",
    async (role) => {
      fake.membership.mockResolvedValue({ role, status: "active" });
      await expect(
        caller().magazinePerformance({ slug: "builders" }),
      ).resolves.toEqual({ magazine: null });
      expect(fake.magazine).toHaveBeenCalledWith(
        { db: database, payload: { marker: "payload" } },
        "resolved-community",
        "en",
        1,
      );
    },
  );
  it.each([
    { role: "moderator", status: "active" },
    { role: "member", status: "active" },
    { role: "owner", status: "invited" },
    { role: "admin", status: "pending_approval" },
    { role: "admin", status: "banned" },
    null,
  ])(
    "rejects $role/$status before magazine or Payload reads",
    async (membership) => {
      fake.membership.mockResolvedValue(membership);
      await expect(
        caller().magazinePerformance({ slug: "builders" }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(fake.magazine).not.toHaveBeenCalled();
      expect(fake.payload).not.toHaveBeenCalled();
    },
  );
  it("rejects guests before magazine reads", async () => {
    await expect(
      caller(false).magazinePerformance({ slug: "builders" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fake.payload).not.toHaveBeenCalled();
  });
  it("validates page and locale, and passes a valid selection through", async () => {
    await expect(
      caller().magazinePerformance({ slug: "builders", page: 0 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().magazinePerformance({ slug: "builders", locale: "de" as "nl" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fake.payload).not.toHaveBeenCalled();
    await caller().magazinePerformance({
      slug: "builders",
      locale: "nl",
      page: 2,
    });
    expect(fake.magazine).toHaveBeenCalledWith(
      expect.anything(),
      "resolved-community",
      "nl",
      2,
    );
  });
});

describe("insights.statistics authorization", () => {
  it.each(["owner", "admin"])(
    "serves active %s using the resolved community ID and default 30 days",
    async (role) => {
      fake.membership.mockResolvedValue({ role, status: "active" });
      await expect(caller().statistics({ slug: "builders" })).resolves.toEqual({
        aggregate: true,
      });
      expect(fake.load).toHaveBeenCalledWith(
        database,
        "resolved-community",
        expect.any(Date),
        30,
      );
    },
  );

  it.each([
    { role: "moderator", status: "active" },
    { role: "member", status: "active" },
    { role: "owner", status: "invited" },
    { role: "admin", status: "pending_approval" },
    { role: "admin", status: "banned" },
    null,
  ])("rejects $role/$status before reading statistics", async (membership) => {
    fake.membership.mockResolvedValue(membership);
    await expect(
      caller().statistics({ slug: "builders", days: 7 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fake.load).not.toHaveBeenCalled();
  });

  it("rejects anonymous requests before reading community data", async () => {
    await expect(
      caller(false).statistics({ slug: "builders" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fake.community).not.toHaveBeenCalled();
    expect(fake.load).not.toHaveBeenCalled();
  });

  it("does not read aggregates for a missing community", async () => {
    fake.community.mockResolvedValue(undefined);
    await expect(
      caller().statistics({ slug: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.load).not.toHaveBeenCalled();
  });

  it("validates presets and passes 90 days through", async () => {
    await expect(
      caller().statistics({ slug: "builders", days: 365 as 90 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(fake.load).not.toHaveBeenCalled();
    await caller().statistics({ slug: "builders", days: 90 });
    expect(fake.load).toHaveBeenCalledWith(
      database,
      "resolved-community",
      expect.any(Date),
      90,
    );
  });
});
