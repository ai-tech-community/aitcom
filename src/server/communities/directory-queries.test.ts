// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { Payload } from "payload";
import type { db as _db } from "@/server/db";
import { loadDiscoveryCandidates } from "./discovery-queries";

vi.mock("@/server/events/public-event-access", () => ({
  loadHiddenEventCommunityIds: async () => [],
}));
vi.mock("@/server/events/event-side-where", () => ({
  loadEventSideWhere: async () => ({ date: { greater_than: "2026-01-01" } }),
}));

import {
  invalidateDirectorySnapshots,
  loadDirectorySnapshot,
} from "./directory-queries";

function database(hubListed = false) {
  const calls: { query: string; params: unknown[] }[] = [];
  const db = drizzle(
    async (query, params) => {
      calls.push({ query, params });
      if (query.includes('"cross_promote"'))
        return {
          rows: [
            [
              "hub",
              "ait",
              "AIT Community",
              "The root community",
              null,
              hubListed,
              true,
            ],
            ["listed", "builders", "Builders", null, null, true, true],
            ["private", "secret-guild", "Private", null, null, false, true],
          ],
        };
      if (query.includes('"join_policy"'))
        return {
          rows: [
            ["hub", "open", new Date("2026-01-01")],
            ["listed", "open", new Date("2026-01-01")],
          ],
        };
      if (query.includes('"community_membership"'))
        return {
          rows: [
            ["hub", 50],
            ["listed", 2],
          ],
        };
      return { rows: [] };
    },
    { casing: "snake_case" },
  );
  return { db: db as unknown as typeof _db, calls };
}
const payload = {
  find: vi.fn(async () => ({ docs: [] })),
} as unknown as Payload;
beforeEach(() => {
  invalidateDirectorySnapshots();
  vi.clearAllMocks();
});

describe("AIT community directory eligibility", () => {
  it("includes the live unlisted AIT root through the real directory loader without exposing private communities", async () => {
    const { db, calls } = database();
    const rows = await loadDirectorySnapshot(db, payload, "en");
    expect(rows.map((row) => row.slug)).toEqual(["ait", "builders"]);
    expect(rows.find((row) => row.slug === "ait")).toMatchObject({
      name: "AIT Community",
      memberCount: 50,
    });
    const candidates = calls.find((call) =>
      call.query.includes('"cross_promote"'),
    )!;
    // The SQL must retrieve the unlisted root, not just admit it in JS.
    expect(candidates.query).toMatch(
      /"is_listed_in_directory" = \$\d+ or .*"slug" = \$\d+/,
    );
    expect(candidates.params).toContain("ait");
    expect(candidates.query).toContain('"deleted_at" is null');
  });

  it.each([false, true])(
    "keeps the Hub out of recommendations even when its listing flag is %s",
    async (hubListed) => {
      const { db, calls } = database(hubListed);
      const rows = await loadDiscoveryCandidates(db, new Date());
      expect(rows.map((row) => row.slug)).toEqual(["builders"]);
      const candidates = calls.find((call) =>
        call.query.includes('"cross_promote"'),
      )!;
      expect(candidates.query).toMatch(/"slug" <> \$\d+/);
      expect(candidates.params).toContain("ait");
      expect(candidates.query).toContain('"deleted_at" is null');
    },
  );

  it("does not add the root to cross-promotion candidates", async () => {
    const { db } = database();
    const rows = await loadDiscoveryCandidates(db, new Date(), {
      crossPromoteOnly: true,
    });
    expect(rows.map((row) => row.slug)).toEqual(["builders"]);
  });
});
