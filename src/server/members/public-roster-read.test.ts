import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { db } from "@/server/db";
import { escapeLike } from "@/server/db/escape-like";
import {
  loadPublicRosterSkills,
  publicRosterOrder,
} from "./public-roster-read";

const dialect = new PgDialect({ casing: "snake_case" });
const compileOrder = (...args: Parameters<typeof publicRosterOrder>) =>
  dialect.sqlToQuery(sql.join(publicRosterOrder(...args), sql`, `));

describe("public roster view ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("retains XP ranking for existing API callers and for the leaderboard", () => {
    expect(compileOrder().sql).toBe('"app"."member_profile"."xp" desc');
    expect(compileOrder("leaderboard").sql).toBe(
      '"app"."member_profile"."xp" desc, "app"."member_profile"."user_id"',
    );
  });

  it("orders by the latest UTC activity day with indexable actor and time bounds, then falls back to join order", () => {
    const { sql: ordering, params } = compileOrder("directory");
    expect(ordering).toContain(
      '(max("app"."activity_event"."created_at") at time zone \'UTC\')::date',
    );
    expect(ordering).toContain('"actor_id" = "app"."member_profile"."user_id"');
    expect(ordering).toContain("\"actor_type\" = 'member'");
    expect(ordering).toContain('"created_at" >= $1::timestamptz');
    expect(ordering).toContain('"created_at" < $2::timestamptz');
    expect(params).toEqual(["2025-11-29T00:00:00Z", "2026-11-29T00:00:00Z"]);
    expect(ordering).toContain(
      'desc nulls last, "app"."member_profile"."created_at" desc, "app"."member_profile"."user_id"',
    );
    expect(ordering).not.toContain('"xp"');
  });

  it("ranks exact name and prefix matches before company and recency, with literal search characters", () => {
    const search = escapeLike("100%_A");
    expect(search).toBe("100\\%\\_A");
    const ordering = compileOrder("directory", search);
    expect(ordering.sql.indexOf('"display_name" ilike $1 then 0')).toBeLessThan(
      ordering.sql.indexOf('"company" ilike $4 then 3'),
    );
    expect(ordering.sql).toMatch(/^case/);
    expect(ordering.params).toEqual([
      search,
      search + "%",
      "%" + search + "%",
      search,
      search + "%",
      "2025-11-29T00:00:00Z",
      "2026-11-29T00:00:00Z",
    ]);
  });
});

it("limits visible profiles before expanding skills and caps the distinct suggestions", async () => {
  const query = vi.fn<RemoteCallback>(async () => ({ rows: [["TypeScript"]] }));
  const client = drizzle(query, { casing: "snake_case" });

  await expect(
    loadPublicRosterSkills(client as unknown as typeof db),
  ).resolves.toEqual(["TypeScript"]);
  expect(query).toHaveBeenCalledTimes(1);
  const [statement, params] = query.mock.calls[0]!;
  expect(statement).toMatch(
    /^select distinct btrim\(json_array_elements_text\("skill_profiles"\."skills"\)\) from \(select /,
  );
  expect(statement).toContain('"member_profile"."is_public"');
  expect(statement).toMatch(
    /limit \$\d+\) "skill_profiles" order by .* limit \$\d+$/,
  );
  expect(params.slice(-2)).toEqual([300, 150]);
});
