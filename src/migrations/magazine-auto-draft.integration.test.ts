// @vitest-environment node
// Exercises the deploy runner's { db } contract on aitcom_test only.
import type { SQL, sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261027c_magazine_auto_draft";
import { up as followupUp } from "./20261027d_magazine_auto_draft_followups";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}

const TABLES = [
  "magazine_auto_draft_settings",
  "magazine_auto_draft_run",
  "magazine_auto_pick",
  "magazine_issue_history",
];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261027c magazine auto-draft [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;
    let userId: string;
    let magazineId: number;
    let issueId: number;

    async function presentTables(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute<{ name: string }>(sql`
      SELECT table_name AS name FROM information_schema.tables
      WHERE table_schema = 'app' AND table_name IN (${sql.join(
        TABLES.map((table) => sql`${table}`),
        sql`, `,
      )})
    `);
      return rows.map((row) => row.name).sort();
    }

    async function hasScheduledVia(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute(sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'magazine_issues' AND column_name = 'scheduled_via'
    `);
      return rows.length === 1;
    }

    function run(
      periodKey: string,
      status = "running",
      id = crypto.randomUUID(),
    ) {
      return sql`
      INSERT INTO "app"."magazine_auto_draft_run"
        ("id", "magazine_id", "period_key", "trigger", "status", "issue_id", "requested_by", "claimed_at")
      VALUES (${id}, ${magazineId}, ${periodKey}, 'schedule', ${status}, ${issueId}, ${userId}, CURRENT_TIMESTAMP)
    `;
    }

    async function expectViolation(statement: SQL, expectedCode: string) {
      let caught: unknown;
      try {
        await db.transaction(async (tx) => {
          await tx.execute(statement);
        });
      } catch (error) {
        caught = error;
      }
      const error = caught as
        | { code?: string; cause?: { code?: string } }
        | undefined;
      expect(error?.code ?? error?.cause?.code).toBe(expectedCode);
    }

    beforeAll(async () => {
      const [database, drizzle, autoDraftMigration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261027c_magazine_auto_draft"),
      ]);
      db = database.db;
      sql = drizzle.sql;
      migration = autoDraftMigration;
      const { rows } = await db.execute<{ name: string }>(
        sql`SELECT current_database() AS name`,
      );
      if (rows[0]?.name !== "aitcom_test") {
        throw new Error(
          `Refusing to migrate "${rows[0]?.name}"; use aitcom_test.`,
        );
      }
      await migration.up({ db } as never);
      await followupUp({ db } as never);
    }, 120_000);

    beforeEach(async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      userId = `mag-auto-${suffix}`;
      await db.execute(sql`
      INSERT INTO "app"."user" ("id", "email", "name")
      VALUES (${userId}, ${`${userId}@example.test`}, 'Editor')
    `);
      const magazine = await db.execute<{ id: number }>(sql`
      INSERT INTO "public"."magazines" ("name", "slug", "community_id", "created_by")
      VALUES ('Automatic drafts test', ${`auto-${suffix}`}, ${`auto-${suffix}`}, ${userId}) RETURNING "id"
    `);
      magazineId = Number(magazine.rows[0]!.id);
      const issue = await db.execute<{ id: number }>(sql`
      INSERT INTO "public"."magazine_issues" ("magazine_id", "community_id", "number", "slug")
      VALUES (${magazineId}, ${`auto-${suffix}`}, 1, 'first-issue') RETURNING "id"
    `);
      issueId = Number(issue.rows[0]!.id);
    });

    afterEach(async () => {
      // Payload's magazine relation sets null; delete its required issue rows first.
      await db.execute(
        sql`DELETE FROM "public"."magazine_issues" WHERE "magazine_id" = ${magazineId}`,
      );
      await db.execute(
        sql`DELETE FROM "public"."magazines" WHERE "id" = ${magazineId}`,
      );
      await db.execute(sql`DELETE FROM "app"."user" WHERE "id" = ${userId}`);
    });

    it("adds the auto origin and the schedule source, and can run twice", async () => {
      await migration.up({ db } as never);
      await migration.up({ db } as never);
      const { rows } = await db.execute<{ origin: string }>(sql`
      SELECT unnest(enum_range(NULL::"public"."enum_magazine_issues_published_via"))::text AS origin
    `);
      expect(rows.map((row) => row.origin)).toContain("auto");
      expect(await hasScheduledVia()).toBe(true);
      expect(await presentTables()).toEqual([...TABLES].sort());
      const indexes = await db.execute<{ name: string }>(sql`
      SELECT indexname AS name FROM pg_indexes
      WHERE schemaname = 'app' AND tablename IN (${sql.join(
        TABLES.map((table) => sql`${table}`),
        sql`, `,
      )})
    `);
      expect(indexes.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          "magazine_auto_draft_run_period_idx",
          "magazine_auto_draft_run_running_idx",
          "magazine_auto_draft_run_issue_idx",
          "magazine_issue_history_magazine_idx",
          "magazine_issue_history_issue_idx",
        ]),
      );
    });

    it("adds recovery and actor columns idempotently and enforces actor kinds", async () => {
      // An earlier application had a default; re-applying must remove it too.
      await db.execute(sql`
        ALTER TABLE "app"."magazine_issue_history"
          ALTER COLUMN "actor_kind" SET DEFAULT 'automatic'
      `);
      await followupUp({ db } as never);
      await followupUp({ db } as never);
      const { rows } = await db.execute<{
        table_name: string;
        column_name: string;
        column_default: string | null;
        is_nullable: string;
      }>(sql`
        SELECT table_name, column_name, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'app' AND (
          (table_name = 'magazine_auto_draft_run' AND column_name = 'last_write_at') OR
          (table_name = 'magazine_issue_history' AND column_name = 'actor_kind')
        ) ORDER BY table_name
      `);
      expect(rows).toEqual([
        {
          table_name: "magazine_auto_draft_run",
          column_name: "last_write_at",
          column_default: null,
          is_nullable: "YES",
        },
        {
          table_name: "magazine_issue_history",
          column_name: "actor_kind",
          column_default: null,
          is_nullable: "NO",
        },
      ]);
      await expectViolation(
        sql`
        INSERT INTO "app"."magazine_issue_history"
          ("magazine_id", "event", "detail")
        VALUES (${magazineId}, 'deleted', '{"event":"deleted"}'::jsonb)
      `,
        "23502",
      );
      await expectViolation(
        sql`
        INSERT INTO "app"."magazine_issue_history"
          ("magazine_id", "event", "actor_kind", "detail")
        VALUES (${magazineId}, 'deleted', 'unknown', '{"event":"deleted"}'::jsonb)
      `,
        "23514",
      );
    });

    it("backfills only proven automatic history and keeps unknown people", async () => {
      const rollback = new Error("rollback actor-kind backfill exercise");
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`
            ALTER TABLE "app"."magazine_issue_history" DROP COLUMN "actor_kind"
          `);
          await tx.execute(sql`
          INSERT INTO "app"."magazine_issue_history"
            ("magazine_id", "event", "origin", "actor_id", "detail")
          VALUES
            (${magazineId}, 'items_changed', null, ${userId}, '{"event":"items_changed","itemCount":1}'::jsonb),
            (${magazineId}, 'items_changed', null, null, '{"event":"items_changed","itemCount":1}'::jsonb),
            (${magazineId}, 'draft_made', null, null, '{"event":"draft_made","trigger":"manual"}'::jsonb),
            (${magazineId}, 'draft_made', null, null, '{"event":"draft_made","trigger":"schedule"}'::jsonb),
            (${magazineId}, 'draft_skipped', null, null, '{"event":"draft_skipped","trigger":"event"}'::jsonb),
            (${magazineId}, 'published', 'button', null, '{"event":"published","origin":"button"}'::jsonb),
            (${magazineId}, 'published', 'auto', null, '{"event":"published","origin":"auto"}'::jsonb),
            (${magazineId}, 'auto_publish_stopped', null, null, '{"event":"auto_publish_stopped","why":"stopped"}'::jsonb),
            (${magazineId}, 'auto_publish_stopped', null, null, '{"event":"auto_publish_stopped","why":"failed"}'::jsonb)
        `);
          await tx.execute(run("month:2026-11", "failed"));
          await followupUp({ db: tx } as never);
          const history = await tx.execute<{ actor_kind: string }>(sql`
          SELECT "actor_kind" FROM "app"."magazine_issue_history"
          WHERE "magazine_id" = ${magazineId} ORDER BY "id"
        `);
          expect(history.rows.map((row) => row.actor_kind)).toEqual([
            "person",
            "person",
            "person",
            "automatic",
            "automatic",
            "person",
            "automatic",
            "person",
            "automatic",
          ]);
          const runs = await tx.execute<{ last_write_at: unknown }>(sql`
          SELECT "last_write_at" FROM "app"."magazine_auto_draft_run"
          WHERE "magazine_id" = ${magazineId}
        `);
          expect(runs.rows).toEqual([{ last_write_at: null }]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    });

    it("keeps settings in bounds", async () => {
      for (const [column, value] of [
        ["month_day", 29],
        ["weekday", 0],
        ["auto_publish_days", 15],
        ["cadence", "daily"],
        ["visibility", "teaser"],
        ["layout", "grid"],
        ["look_back", "forever"],
        ["when_ready", "publish_now"],
      ] as const) {
        await expectViolation(
          sql`
        INSERT INTO "app"."magazine_auto_draft_settings" ("magazine_id", ${sql.identifier(column)})
        VALUES (${magazineId}, ${value})
      `,
          "23514",
        );
      }
      await db.execute(
        sql`INSERT INTO "app"."magazine_auto_draft_settings" ("magazine_id") VALUES (${magazineId})`,
      );
      const { rows } = await db.execute(sql`
      SELECT * FROM "app"."magazine_auto_draft_settings" WHERE "magazine_id" = ${magazineId}
    `);
      expect(rows[0]).toMatchObject({
        enabled: false,
        cadence: "monthly",
        month_day: 1,
        weekday: 1,
        look_back: "since_last_issue",
        layout: "cover-story",
        visibility: null,
        sources: {},
        never_reuse: true,
        when_ready: "notify",
        auto_publish_days: 3,
        schedule_starts_at: null,
      });
    });

    it("allows one run per period and one running run per magazine", async () => {
      await db.execute(run("month:2026-11", "made"));
      await expectViolation(run("month:2026-11", "made"), "23505");
      await db.execute(run("month:2026-12"));
      await expectViolation(run("month:2027-01"), "23505");
      const { rows } = await db.execute(
        sql`SELECT "status" FROM "app"."magazine_auto_draft_run" WHERE "magazine_id" = ${magazineId}`,
      );
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => row.status).sort()).toEqual(["made", "running"]);
    });

    it("cleans up with its parents and keeps history of deleted issues", async () => {
      await db.execute(sql`
      INSERT INTO "app"."magazine_auto_draft_settings" ("magazine_id", "updated_by") VALUES (${magazineId}, ${userId})
    `);
      const runId = crypto.randomUUID();
      await db.execute(run("month:2026-11", "made", runId));
      await db.execute(sql`
      INSERT INTO "app"."magazine_auto_pick" ("issue_id", "item_id", "reason")
      VALUES (${issueId}, 'block-1', '{"type":"newMembers","count":3}'::jsonb)
    `);
      await db.execute(sql`
      INSERT INTO "app"."magazine_issue_history"
        ("magazine_id", "issue_id", "issue_number", "issue_title", "event", "actor_id", "actor_kind", "detail")
      VALUES (${magazineId}, ${issueId}, 1, 'First issue', 'items_changed', ${userId}, 'person', '{"event":"items_changed","itemCount":1}'::jsonb)
    `);
      await db.execute(
        sql`DELETE FROM "public"."magazine_issues" WHERE "id" = ${issueId}`,
      );
      expect(
        (
          await db.execute(
            sql`SELECT * FROM "app"."magazine_auto_pick" WHERE "issue_id" = ${issueId}`,
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await db.execute(
            sql`SELECT "issue_id" FROM "app"."magazine_auto_draft_run" WHERE "id" = ${runId}`,
          )
        ).rows,
      ).toEqual([{ issue_id: null }]);
      expect(
        (
          await db.execute(
            sql`SELECT "issue_id", "issue_number", "issue_title" FROM "app"."magazine_issue_history" WHERE "magazine_id" = ${magazineId}`,
          )
        ).rows,
      ).toEqual([
        { issue_id: null, issue_number: 1, issue_title: "First issue" },
      ]);

      await db.execute(sql`DELETE FROM "app"."user" WHERE "id" = ${userId}`);
      expect(
        (
          await db.execute(
            sql`SELECT "updated_by" FROM "app"."magazine_auto_draft_settings" WHERE "magazine_id" = ${magazineId}`,
          )
        ).rows,
      ).toEqual([{ updated_by: null }]);
      expect(
        (
          await db.execute(
            sql`SELECT "requested_by" FROM "app"."magazine_auto_draft_run" WHERE "id" = ${runId}`,
          )
        ).rows,
      ).toEqual([{ requested_by: null }]);
      expect(
        (
          await db.execute(
            sql`SELECT "actor_id", "actor_kind" FROM "app"."magazine_issue_history" WHERE "magazine_id" = ${magazineId}`,
          )
        ).rows,
      ).toEqual([{ actor_id: null, actor_kind: "person" }]);

      await db.execute(
        sql`DELETE FROM "public"."magazines" WHERE "id" = ${magazineId}`,
      );
      for (const table of TABLES.filter(
        (table) => table !== "magazine_auto_pick",
      )) {
        expect(
          (
            await db.execute(
              sql`SELECT * FROM "app".${sql.identifier(table)} WHERE "magazine_id" = ${magazineId}`,
            )
          ).rows,
        ).toEqual([]);
      }
    });

    it("down removes the tables and the column, up restores them", async () => {
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await migration.down({ db: tx } as never);
          expect(await presentTables(tx)).toEqual([]);
          expect(await hasScheduledVia(tx)).toBe(false);
          await migration.up({ db: tx } as never);
          await followupUp({ db: tx } as never);
          await tx.execute(
            sql`SELECT "actor_kind" FROM "app"."magazine_issue_history" LIMIT 0`,
          );
          await tx.execute(
            sql`SELECT "last_write_at" FROM "app"."magazine_auto_draft_run" LIMIT 0`,
          );
          expect(await presentTables(tx)).toEqual([...TABLES].sort());
          expect(await hasScheduledVia(tx)).toBe(true);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await presentTables()).toEqual([...TABLES].sort());
      expect(await hasScheduledVia()).toBe(true);
    });
  },
);
