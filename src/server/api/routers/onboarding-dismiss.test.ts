import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbHooks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  updates: [] as Array<{ table: unknown; set: unknown; where: unknown }>,
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
      update: (table: unknown) => ({
        set: (set: unknown) => ({
          where: (where: unknown) => {
            dbHooks.updates.push({ table, set, where });
            return Promise.resolve();
          },
        }),
      }),
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
import { memberProfiles } from "@/server/db/schema";

function caller(userId: string | null = "user-1") {
  return createCaller({
    db: mockedDb,
    session: userId ? ({ user: { id: userId } } as never) : null,
    headers: new Headers(),
  } as never);
}

// Same casing as the app db client, so column names render as in Postgres.
const dialect = new PgDialect({ casing: "snake_case" });
const toSql = (fragment: unknown) => dialect.sqlToQuery(fragment as SQL);

beforeEach(() => {
  dbHooks.selectResults = [];
  dbHooks.updates = [];
});

describe("onboarding.dismiss", () => {
  it("stores the dismissal on the signed-in member's profile, keeping the first time", async () => {
    const result = await caller("user-1").onboarding.dismiss();

    expect(result).toEqual({ dismissed: true });
    expect(dbHooks.updates).toHaveLength(1);
    const [update] = dbHooks.updates;
    expect(update!.table).toBe(memberProfiles);

    const set = update!.set as { onboardingDismissedAt: SQL };
    expect(Object.keys(set)).toEqual(["onboardingDismissedAt"]);
    expect(toSql(set.onboardingDismissedAt).sql).toBe(
      'coalesce("app"."member_profile"."onboarding_dismissed_at", now())',
    );

    const where = toSql(update!.where);
    expect(where.sql).toBe('"app"."member_profile"."user_id" = $1');
    expect(where.params).toEqual(["user-1"]);
  });

  it("rejects guests", async () => {
    await expect(caller(null).onboarding.dismiss()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(dbHooks.updates).toHaveLength(0);
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
    expect(status.checklist.length).toBeGreaterThan(0);
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
