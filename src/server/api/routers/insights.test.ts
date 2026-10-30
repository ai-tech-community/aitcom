// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  community: vi.fn(),
  membership: vi.fn(),
  load: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));
vi.mock("@/server/inbox/dm", () => ({ sendDirectMessage: vi.fn() }));
vi.mock("@/server/communities/statistics-queries", () => ({
  loadCommunityStatistics: fake.load,
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
