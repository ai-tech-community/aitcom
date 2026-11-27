// @vitest-environment node
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  isMissingCommunityThemeSchema,
  readCommunityThemeId,
  writeCommunityThemeId,
} from "./theme-store";

const dialect = new PgDialect({ casing: "snake_case" });

type Rendered = { sql: string; params: unknown[] };

function fakeDb(respond: (query: Rendered) => unknown) {
  const queries: Rendered[] = [];
  return {
    queries,
    execute: async (query: SQL) => {
      const rendered = dialect.sqlToQuery(query);
      queries.push(rendered);
      return respond(rendered);
    },
  };
}

const MISSING_TABLE = new Error(
  'relation "app.community_theme" does not exist',
);

describe("readCommunityThemeId", () => {
  it("returns the stored look", async () => {
    const db = fakeDb(() => ({ rows: [{ theme_id: "canal" }] }));
    await expect(readCommunityThemeId(db, "c1")).resolves.toBe("canal");
    expect(db.queries[0]!.sql).toContain('FROM "app"."community_theme"');
    expect(db.queries[0]!.params).toEqual(["c1"]);
  });

  it("reads a look that left the catalog as plain", async () => {
    const db = fakeDb(() => ({ rows: [{ theme_id: "gone" }] }));
    await expect(readCommunityThemeId(db, "c1")).resolves.toBe("plain");
  });

  it("reads no row as plain", async () => {
    const db = fakeDb(() => ({ rows: [] }));
    await expect(readCommunityThemeId(db, "c1")).resolves.toBe("plain");
  });

  it("reads a database without the table as plain", async () => {
    const db = fakeDb(() => {
      throw MISSING_TABLE;
    });
    await expect(readCommunityThemeId(db, "c1")).resolves.toBe("plain");
  });

  it("rethrows any other error", async () => {
    const failure = new Error("connection reset");
    const db = fakeDb(() => {
      throw failure;
    });
    await expect(readCommunityThemeId(db, "c1")).rejects.toBe(failure);
  });
});

describe("writeCommunityThemeId", () => {
  it("deletes the row when the look is plain", async () => {
    const db = fakeDb(() => ({ rows: [] }));
    await writeCommunityThemeId(db, "c1", "plain", "u1");
    expect(db.queries).toHaveLength(1);
    expect(db.queries[0]!.sql).toContain('DELETE FROM "app"."community_theme"');
    expect(db.queries[0]!.sql).not.toMatch(/INSERT/i);
    expect(db.queries[0]!.params).toEqual(["c1"]);
  });

  it("upserts any other look with who changed it", async () => {
    const db = fakeDb(() => ({ rows: [] }));
    await writeCommunityThemeId(db, "c1", "night", "u1");
    expect(db.queries).toHaveLength(1);
    const { sql, params } = db.queries[0]!;
    expect(sql).toContain('INSERT INTO "app"."community_theme"');
    expect(sql).toContain('ON CONFLICT ("community_id") DO UPDATE');
    expect(sql).toContain('"updated_at" = now()');
    expect(params).toEqual(["c1", "night", "u1"]);
  });
});

describe("isMissingCommunityThemeSchema", () => {
  const FAILED_QUERY =
    'Failed query: SELECT "theme_id" FROM "app"."community_theme" WHERE "community_id" = $1 LIMIT 1';

  it("spots the missing table, also when wrapped in a cause", () => {
    expect(isMissingCommunityThemeSchema(MISSING_TABLE)).toBe(true);
    expect(
      isMissingCommunityThemeSchema(
        new Error(FAILED_QUERY, { cause: MISSING_TABLE }),
      ),
    ).toBe(true);
  });

  it("spots the Postgres undefined-table code along the cause chain", () => {
    const coded = Object.assign(new Error("undefined table"), {
      code: "42P01",
    });
    expect(isMissingCommunityThemeSchema(coded)).toBe(true);
    expect(
      isMissingCommunityThemeSchema(new Error(FAILED_QUERY, { cause: coded })),
    ).toBe(true);
  });

  it("does not take a failed query that names the table as a missing table", () => {
    expect(
      isMissingCommunityThemeSchema(
        new Error(FAILED_QUERY, { cause: new Error("connection reset") }),
      ),
    ).toBe(false);
  });

  it("does not take a permission error on the table as a missing table", () => {
    const denied = Object.assign(
      new Error("permission denied for table community_theme"),
      { code: "42501" },
    );
    expect(isMissingCommunityThemeSchema(denied)).toBe(false);
  });

  it("ignores other errors", () => {
    expect(isMissingCommunityThemeSchema(new Error("timeout"))).toBe(false);
    expect(isMissingCommunityThemeSchema(undefined)).toBe(false);
  });
});

describe("readCommunityThemeId on a failing query", () => {
  it("rethrows a connection error even when the message names the table", async () => {
    const failure = new Error(
      'Failed query: SELECT "theme_id" FROM "app"."community_theme" WHERE "community_id" = $1 LIMIT 1',
      { cause: new Error("connection reset") },
    );
    const db = fakeDb(() => {
      throw failure;
    });
    await expect(readCommunityThemeId(db, "c1")).rejects.toBe(failure);
  });

  it("rethrows a permission error on the table", async () => {
    const failure = new Error("permission denied for table community_theme");
    const db = fakeDb(() => {
      throw failure;
    });
    await expect(readCommunityThemeId(db, "c1")).rejects.toBe(failure);
  });
});
