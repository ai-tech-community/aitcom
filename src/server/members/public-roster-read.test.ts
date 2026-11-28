import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { escapeRosterSearch, publicRosterOrder } from "./public-roster-read";

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

  it("orders the directory by the latest member activity day before fallback dates", () => {
    const { sql: ordering, params } = compileOrder("directory");
    expect(ordering).toContain(
      'max(("app"."activity_event"."created_at" at time zone \'UTC\')::date)',
    );
    expect(ordering).toContain("\"actor_type\" = 'member'");
    expect(ordering).toContain("between $1::date and $2::date");
    expect(params).toEqual(["2025-11-29", "2026-11-28"]);
    expect(ordering).toContain(
      'desc nulls last, "app"."member_profile"."created_at" desc, "app"."member_profile"."user_id"',
    );
    expect(ordering).not.toContain('"xp"');
  });

  it("ranks exact name and prefix matches before company and recency, with literal search characters", () => {
    const search = escapeRosterSearch("100%_A");
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
      "2025-11-29",
      "2026-11-28",
    ]);
  });
});
