// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { Deps } from "../deps";
import { loadCommunityMagazineStats } from "./community-stats";
import { joinSourceCondition } from "@/server/communities/join-sources";

const magazine = { id: 12, name: "Builders Journal", communityId: "c1" };
const issue = {
  id: 21,
  number: 3,
  title: "Building together",
  publishedAt: "2026-10-27T12:00:00Z",
};
const find = vi.fn();
let calls: { sql: string; params: unknown[] }[];
let reads: unknown[], subscriptions: unknown[], joins: unknown[];
const execute = vi.fn(async (statement: SQL) => {
  const compiled = new PgDialect({ casing: "snake_case" }).sqlToQuery(
    statement,
  );
  calls.push(compiled);
  return {
    rows: compiled.sql.includes('"magazine_read"')
      ? reads
      : compiled.sql.includes('"magazine_subscription"')
        ? subscriptions
        : joins,
  };
});
const deps = { payload: { find }, db: { execute } } as unknown as Deps;
beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  reads = [
    { issueId: null, isTotal: 1, views: "100", readers: "7" },
    { issueId: 21, isTotal: 0, views: "20", readers: "5" },
  ];
  subscriptions = [
    { issueId: null, isTotal: 1, total: "13" },
    { issueId: 21, isTotal: 0, total: "4" },
  ];
  joins = [
    { issueId: null, isTotal: 1, total: "6" },
    { issueId: 21, isTotal: 0, total: "2" },
  ];
  find.mockImplementation(async ({ collection }) =>
    collection === "magazines"
      ? { docs: [magazine] }
      : { docs: [issue], totalDocs: 15, totalPages: 2 },
  );
});

describe("community magazine performance", () => {
  it("keeps the existing single-issue attribution condition parameterized", () => {
    const query = new PgDialect({ casing: "snake_case" }).sqlToQuery(
      joinSourceCondition({ via: "magazine", magazineId: 12, issueId: 21 }),
    );
    expect(query.params).toEqual(["magazine", "21"]);
    expect(query.sql).toContain("->>'via'");
    expect(query.sql).toContain("->>'issueId'");
  });
  it("returns global totals instead of summing the displayed issue page", async () => {
    const data = await loadCommunityMagazineStats(deps, "c1", "nl", 1);
    expect(data.magazine).toEqual({ id: 12, name: "Builders Journal" });
    expect(data.summary).toEqual({
      publishedIssues: 15,
      views: 100,
      readers: 7,
      subscribers: 13,
      joins: 6,
    });
    expect(data.issues).toEqual([
      {
        ...issue,
        publishedAt: "2026-10-27T12:00:00.000Z",
        views: 20,
        readers: 5,
        subscribers: 4,
        joins: 2,
      },
    ]);
    expect(data).toMatchObject({ page: 1, totalPages: 2, pageSize: 10 });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "magazines",
        where: { communityId: { equals: "c1" } },
        limit: 1,
      }),
    );
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "magazine-issues",
        locale: "nl",
        page: 1,
        limit: 10,
        sort: ["-publishedAt", "-id"],
        where: {
          and: [
            { communityId: { equals: "c1" } },
            { magazine: { equals: 12 } },
            { status: { equals: "published" } },
          ],
        },
      }),
    );
    expect(execute).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(data)).not.toContain("readerKey");
    expect(JSON.stringify(data)).not.toContain("email");
  });

  it("compiles scoped, published-only totals and bounded per-page aggregates", async () => {
    await loadCommunityMagazineStats(deps, "c1", "en", 1);
    const readQuery = calls.find((call) =>
      call.sql.includes('"magazine_read"'),
    )!;
    expect(readQuery.sql).toContain(
      'COUNT(DISTINCT "app"."magazine_read"."reader_key")',
    );
    expect(readQuery.sql).toContain(
      'FILTER (WHERE "app"."magazine_read"."article_id" IS NULL)',
    );
    for (const query of [
      readQuery,
      calls.find((call) => call.sql.includes('"activity_event"'))!,
    ]) {
      expect(query.sql).toContain("FROM public.magazine_issues");
      expect(query.sql).toContain("status = 'published'");
      expect(query.params).toContain("c1");
      expect(query.params).toContain(12);
      expect(query.sql).toContain("GROUPING SETS");
      expect(query.sql).toContain("HAVING");
      expect(query.params).toContain(21);
      expect(query.sql).not.toMatch(/\bLIMIT\b/);
    }
    const subscriptionQuery = calls.find((call) =>
      call.sql.includes('"magazine_subscription"'),
    )!;
    expect(subscriptionQuery.sql).toContain('"confirmed_at" IS NOT NULL');
    expect(subscriptionQuery.params).toContain(12);
    const joinQuery = calls.find((call) =>
      call.sql.includes('"activity_event"'),
    )!;
    expect(joinQuery.sql).toContain(
      'COUNT(DISTINCT "app"."activity_event"."actor_id")',
    );
    expect(joinQuery.params).toContain("magazine");
    expect(joinQuery.params).toContain("community.join_requested");
    expect(joinQuery.params).toContain("community.joined");
    expect(joinQuery.sql).toContain("status\" = 'active'");
    for (const query of calls)
      expect(query.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });

  it("returns a missing-magazine state without querying readership or creating a magazine", async () => {
    find.mockResolvedValue({ docs: [] });
    const data = await loadCommunityMagazineStats(deps, "c1", "en", 1);
    expect(data.magazine).toBeNull();
    expect(data.issues).toEqual([]);
    expect(data.summary.subscribers).toBe(0);
    expect(find).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });

  it("retains current subscribers before the first issue is published", async () => {
    find.mockImplementation(async ({ collection }) =>
      collection === "magazines"
        ? { docs: [magazine] }
        : { docs: [], totalDocs: 0, totalPages: 1 },
    );
    reads = [];
    joins = [];
    const data = await loadCommunityMagazineStats(deps, "c1", "en", 1);
    expect(data.summary).toEqual({
      publishedIssues: 0,
      views: 0,
      readers: 0,
      subscribers: 13,
      joins: 0,
    });
    expect(data.issues).toEqual([]);
  });

  it("clamps an out-of-range page while retaining all-issue totals", async () => {
    const data = await loadCommunityMagazineStats(deps, "c1", "en", 99);
    expect(data.page).toBe(2);
    expect(find).toHaveBeenLastCalledWith(
      expect.objectContaining({ collection: "magazine-issues", page: 2 }),
    );
    expect(data.summary.views).toBe(100);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("propagates read errors instead of manufacturing zeros", async () => {
    execute.mockRejectedValueOnce(new Error("read unavailable"));
    await expect(
      loadCommunityMagazineStats(deps, "c1", "en", 1),
    ).rejects.toThrow("read unavailable");
  });
});
