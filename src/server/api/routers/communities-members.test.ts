// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
const visibility = vi.hoisted(() => ({ roster: vi.fn() }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://app.test" },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/agent/activity", () => ({ logActivity: vi.fn() }));
vi.mock("@/server/communities/content-visibility-queries", () => ({
  viewerCanReadRoster: visibility.roster,
}));
import { communitiesRouter } from "./communities";

function fixture() {
  const joinedAt = new Date("2026-11-12T10:00:00Z");
  const rows = ["c", "b", "a"].map((userId) => ({
    userId,
    joinedAt,
    displayName: userId,
    role: "member",
    bio: null,
    image: null,
  }));
  const filters: unknown[] = [];
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: (filter: unknown) => {
      filters.push(filter);
      return chain;
    },
    orderBy: () => chain,
    limit: vi.fn(async () => [...rows]),
  };
  const database = {
    query: {
      communities: {
        findFirst: vi.fn(async () => ({ id: "community-a", slug: "alpha" })),
      },
    },
    select: vi.fn(() => chain),
  };
  const caller = communitiesRouter.createCaller({
    db: database as never,
    session: null,
    headers: new Headers(),
  });
  return { rows, filters, database, caller, chain };
}
beforeEach(() => {
  vi.clearAllMocks();
  visibility.roster.mockResolvedValue(true);
});

describe("Members directory used by the matching hub", () => {
  it("sets the next cursor to the last returned member so the sentinel is not skipped", async () => {
    const fake = fixture();
    const first = await fake.caller.getMembers({ slug: "alpha", limit: 2 });
    expect(first.items.map((row) => row.userId)).toEqual(["c", "b"]);
    expect(first.nextCursor).toEqual({
      userId: "b",
      joinedAt: "2026-11-12T10:00:00.000Z",
    });
    fake.chain.limit.mockResolvedValue([fake.rows[2]!]);
    const next = await fake.caller.getMembers({
      slug: "alpha",
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(next.items.map((row) => row.userId)).toEqual(["a"]);
    expect(next.nextCursor).toBeUndefined();
    expect(
      new PgDialect().sqlToQuery(fake.filters[1] as never).params,
    ).toContain("b");
  });
  it("searches names/bios within the community and treats wildcard characters literally", async () => {
    const fake = fixture();
    await fake.caller.getMembers({ slug: "alpha", q: "  Greg_50%  " });
    const query = new PgDialect().sqlToQuery(fake.filters[0] as never);
    expect(query.params).toEqual([
      "community-a",
      "active",
      "%Greg\\_50\\%%",
      "%Greg\\_50\\%%",
      "%Greg\\_50\\%%",
    ]);
  });
  it("preserves the existing roster visibility check before searching", async () => {
    visibility.roster.mockResolvedValue(false);
    const fake = fixture();
    await expect(
      fake.caller.getMembers({ slug: "alpha", q: "Greg" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.database.select).not.toHaveBeenCalled();
  });
});
