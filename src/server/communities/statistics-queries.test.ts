// @vitest-environment node
import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import { loadCommunityStatistics } from "./statistics-queries";

describe("community statistics SQL", () => {
  it("scopes all reads, bounds event history, excludes commissioned work and returns aggregates only", async () => {
    const calls: { query: string; params: unknown[] }[] = [];
    const proxy = drizzle(
      async (query, params) => {
        calls.push({ query, params });
        if (query.includes('"community_membership"'))
          return {
            rows: [
              ["active", 9],
              ["invited", 2],
            ],
          };
        return {
          rows: [
            ["2026-10-29", "thread.reply", "member", 5],
            ["2026-10-29", "community.joined", "agent", 1],
          ],
        };
      },
      { casing: "snake_case" },
    );
    // The proxy's raw execute result differs from the production Pool driver.
    const database = Object.assign(proxy, {
      execute: async (statement: SQL) => {
        const compiled = new PgDialect({ casing: "snake_case" }).sqlToQuery(
          statement,
        );
        calls.push({ query: compiled.sql, params: compiled.params });
        return { rows: [{ current: 2, previous: 1, returning: 1 }] };
      },
    });
    const data = await loadCommunityStatistics(
      database as unknown as typeof _db,
      "community-owned",
      new Date("2026-10-30T12:00Z"),
      90,
    );
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call.params).toContain("community-owned");
      expect(call.query).toMatch(/"community_id" = \$\d+/);
      expect(call.query).not.toMatch(/\b(insert|update|delete)\b/i);
    }
    const eventReads = calls.filter((call) =>
      call.query.includes('"activity_event"'),
    );
    for (const call of eventReads) {
      expect(call.query).toContain('"created_at" >=');
      expect(call.query).toContain('"created_at" <');
      expect(call.params).toContain("2026-05-03T00:00:00.000Z");
      expect(call.params).toContain("2026-10-30T00:00:00.000Z");
      expect(call.query).toContain("IS DISTINCT FROM 'true'");
      expect(call.query).toContain("isCommissioned");
      expect(call.query.toLowerCase()).not.toContain(" limit ");
    }
    const daily = eventReads.find((call) =>
      call.query.includes("AT TIME ZONE 'UTC'"),
    )!;
    expect(daily).toBeDefined();
    expect(daily.params).toContain("community.joined");
    expect(daily.params).toContain("community.left");
    const distinct = eventReads.find((call) =>
      call.query.includes("contributed_now"),
    )!;
    expect(distinct.query).toContain("GROUP BY");
    expect(distinct.query).toContain("\"actor_type\" = 'member'");
    expect(distinct.query).toContain("contributed_now AND contributed_before");
    expect(data.members).toEqual({ active: 9, pending: 0, invited: 2 });
    expect(data.metrics.contributors.current).toBe(2);
    expect(data.returningContributors).toBe(1);
    expect(data.metrics.joins.current).toBe(1);
    expect(data.metrics.contributions.current).toBe(5);
    expect(JSON.stringify(data)).not.toContain("actorId");
    expect(JSON.stringify(data)).not.toContain("community-owned");
  });

  it("propagates read failures instead of returning empty activity", async () => {
    const proxy = drizzle(async () => {
      throw new Error("offline");
    });
    await expect(
      loadCommunityStatistics(
        proxy as unknown as typeof _db,
        "c1",
        new Date(),
        7,
      ),
    ).rejects.toThrow("offline");
  });
});
