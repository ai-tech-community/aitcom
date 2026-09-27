import { readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/neon-serverless";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbHooks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
}));

vi.mock("@/server/db", () => {
  function selectChain() {
    const chain: Record<string, unknown> = {};
    for (const m of ["from", "where", "innerJoin", "orderBy", "limit"]) {
      chain[m] = () => chain;
    }
    chain.then = (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(dbHooks.selectResults.shift() ?? []).then(resolve);
    return chain;
  }
  return {
    db: {
      select: () => selectChain(),
    },
  };
});

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
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({}),
}));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";
import * as schema from "@/server/db/schema";
import { memberProfiles } from "@/server/db/schema";

function caller(
  userId: string | null = "user-1",
  db: unknown = mockedDb,
  user: Record<string, unknown> = {},
) {
  return createCaller({
    db,
    session: userId ? ({ user: { id: userId, ...user } } as never) : null,
    headers: new Headers(),
  } as never);
}

/**
 * A real Drizzle db (same driver and casing as src/server/db) over a fake
 * client that records the SQL it is asked to run. Asserts on the exact
 * statement instead of on a hand-rolled chain mock.
 */
function recordingDb() {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: async (
      query: string | { text: string; values?: unknown[] },
      params?: unknown[],
    ) => {
      const text = typeof query === "string" ? query : query.text;
      const values =
        typeof query === "string" ? params : (query.values ?? params);
      statements.push({ sql: text, params: values ?? [] });
      return { rows: [], fields: [], rowCount: 1, command: "INSERT" };
    },
  };
  const db = drizzle(client as never, { schema, casing: "snake_case" });
  return { db, statements };
}

const dialect = new PgDialect({ casing: "snake_case" });
const toSql = (fragment: unknown) => dialect.sqlToQuery(fragment as SQL);

beforeEach(() => {
  dbHooks.selectResults = [];
});

describe("onboarding.dismiss", () => {
  it("upserts the dismissal on the member's profile, keeping the first time", async () => {
    const { db, statements } = recordingDb();
    const result = await caller("user-1", db, {
      name: "Ada Lovelace",
      email: "ada@example.com",
    }).onboarding.dismiss();

    expect(result).toEqual({ dismissed: true });
    expect(statements).toHaveLength(1);
    const [stmt] = statements;
    expect(stmt!.sql.startsWith('insert into "app"."member_profile" ')).toBe(
      true,
    );
    expect(stmt!.sql).toContain(
      'on conflict ("user_id") do update set "onboarding_dismissed_at" = coalesce("app"."member_profile"."onboarding_dismissed_at", now())',
    );
    // Only the dismissal is touched on an existing row.
    expect(stmt!.sql).not.toMatch(/do update set .*"display_name"/);
    expect(stmt!.params).toContain("user-1");
    expect(stmt!.params).toContain("Ada Lovelace");
  });

  it("creates the profile row for a member who has none, with the sign-up display name", async () => {
    // No member_profile row: the INSERT branch runs. Name falls back to the
    // email local part, exactly like better-auth user.create.after.
    const { db, statements } = recordingDb();
    await caller("user-2", db, {
      name: "",
      email: "grace@example.com",
    }).onboarding.dismiss();

    const [stmt] = statements;
    expect(stmt!.sql).toMatch(/^insert into "app"."member_profile"/);
    expect(stmt!.sql).toMatch(/values \(\$1, \$2, .*now\(\)/);
    expect(stmt!.params.slice(0, 2)).toEqual(["user-2", "grace"]);
  });

  it("rejects guests", async () => {
    const { db, statements } = recordingDb();
    await expect(caller(null, db).onboarding.dismiss()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(statements).toHaveLength(0);
  });
});

describe("onboarding.restore", () => {
  it("clears the dismissal on the member's own profile row only", async () => {
    const { db, statements } = recordingDb();
    const result = await caller("user-1", db).onboarding.restore();

    expect(result).toEqual({ dismissed: false });
    expect(statements).toHaveLength(1);
    const [stmt] = statements;
    // updated_at is the column's own $onUpdate bump; nothing else is touched.
    expect(stmt!.sql).toBe(
      'update "app"."member_profile" set "onboarding_dismissed_at" = $1, "updated_at" = $2 where "app"."member_profile"."user_id" = $3',
    );
    expect(stmt!.params[0]).toBeNull();
    expect(stmt!.params[2]).toBe("user-1");
  });

  it("is idempotent: a repeat call sends the same statement and result", async () => {
    const { db, statements } = recordingDb();
    const first = await caller("user-1", db).onboarding.restore();
    const second = await caller("user-1", db).onboarding.restore();

    expect(second).toEqual(first);
    expect(statements).toHaveLength(2);
    expect(statements[1]!.sql).toBe(statements[0]!.sql);
    // Sets NULL, not "toggle": the second call leaves the same end state.
    expect(statements[1]!.params[0]).toBeNull();
  });

  it("does not create a profile row for a member who has none", async () => {
    // No row means never dismissed: an UPDATE that touches 0 rows is correct.
    const { db, statements } = recordingDb();
    await caller("user-2", db).onboarding.restore();

    expect(statements).toHaveLength(1);
    expect(statements[0]!.sql).toMatch(/^update /);
    expect(statements[0]!.sql).not.toMatch(/insert/i);
  });

  it("rejects guests", async () => {
    const { db, statements } = recordingDb();
    await expect(caller(null, db).onboarding.restore()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(statements).toHaveLength(0);
  });
});

describe("onboarding.getStatus dismissed flag", () => {
  const profile = {
    userId: "user-1",
    onboardingIntent: "learning",
    onboardingCompleted: false,
    displayName: "Ada",
    bio: null,
    skills: [],
    company: null,
  };

  it("reports dismissed when the profile has a dismissal time", async () => {
    dbHooks.selectResults = [
      [{ ...profile, onboardingDismissedAt: new Date("2026-09-27") }],
      [], // completed steps
      [], // agent
      [], // thread activity
      [], // vote activity
    ];
    const status = await caller().onboarding.getStatus();
    expect(status.dismissed).toBe(true);
    // Early return: no step or auto-detect queries for a dismissed member.
    expect(status.checklist).toEqual([]);
    expect(dbHooks.selectResults).toHaveLength(4);
  });

  it("reports not dismissed when the time is null", async () => {
    dbHooks.selectResults = [
      [{ ...profile, onboardingDismissedAt: null }],
      [],
      [],
      [],
      [],
    ];
    const status = await caller().onboarding.getStatus();
    expect(status.dismissed).toBe(false);
  });

  it("reports not dismissed when there is no profile yet", async () => {
    dbHooks.selectResults = [[]];
    const status = await caller().onboarding.getStatus();
    expect(status).toMatchObject({ hasProfile: false, dismissed: false });
  });
});

describe("onboarding dismissal migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "src/migrations/20260927c_onboarding_dismissed_at.ts"),
    "utf8",
  );

  it("adds and drops the column idempotently", () => {
    expect(migration).toContain('ALTER TABLE "app"."member_profile"');
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "onboarding_dismissed_at" timestamptz',
    );
    expect(migration).toContain(
      'DROP COLUMN IF EXISTS "onboarding_dismissed_at"',
    );
  });

  it("is registered once in the migrations index, after 20260927b", async () => {
    const { migrations } = await import("@/migrations");
    const names = migrations.map((m) => m.name);
    const at = names.indexOf("20260927c_onboarding_dismissed_at");
    expect(at).toBeGreaterThan(-1);
    expect(names.lastIndexOf("20260927c_onboarding_dismissed_at")).toBe(at);
    expect(at).toBeGreaterThan(
      names.indexOf("20260927b_feed_post_counter_repair"),
    );
    expect(typeof migrations[at]!.up).toBe("function");
    expect(typeof migrations[at]!.down).toBe("function");
  });

  it("matches the Drizzle column (nullable timestamptz)", () => {
    const column = memberProfiles.onboardingDismissedAt;
    expect(toSql(sql`${column}`).sql).toBe(
      '"app"."member_profile"."onboarding_dismissed_at"',
    );
    expect(column.notNull).toBe(false);
    expect(column.getSQLType()).toBe("timestamp with time zone");
  });
});
