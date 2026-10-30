// @vitest-environment node
// Exercises the deploy runner's { db } contract on aitcom_test only.
import type { sql as Sql } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type * as Migration from "./20261027a_magazine_staff";

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

const EXPECTED_COLUMNS = [
  "magazine_id",
  "community_id",
  "user_id",
  "role",
  "assigned_by",
  "created_at",
  "updated_at",
];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261027a magazine staff [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let migration: typeof Migration;
    let suffix: string;
    let writerId: string;
    let assignerId: string;
    let magazineId: number;

    async function presentColumns(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute<{ name: string }>(sql`
        SELECT column_name AS name FROM information_schema.columns
        WHERE table_schema = 'app' AND table_name = 'magazine_staff'
        ORDER BY ordinal_position
      `);
      return rows.map((row) => row.name);
    }

    async function insertStaff(
      on: Pick<typeof Db, "execute"> = db,
      role = "contributor",
    ) {
      await on.execute(sql`
        INSERT INTO "app"."magazine_staff"
          ("magazine_id", "community_id", "user_id", "role", "assigned_by")
        VALUES (${magazineId}, ${`community-${suffix}`}, ${writerId}, ${role}, ${assignerId})
      `);
    }

    async function expectViolation(role: string, expectedCode: string) {
      // The failed statement aborts its transaction, not the fixture's writes.
      let caught: unknown;
      try {
        await db.transaction(async (tx) => insertStaff(tx, role));
      } catch (error) {
        caught = error;
      }
      const error = caught as
        | { code?: string; cause?: { code?: string } }
        | undefined;
      expect(error?.code ?? error?.cause?.code).toBe(expectedCode);
    }

    beforeAll(async () => {
      const [database, drizzle, staffMigration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261027a_magazine_staff"),
      ]);
      db = database.db;
      sql = drizzle.sql;
      migration = staffMigration;
      const { rows } = await db.execute<{ name: string }>(
        sql`SELECT current_database() AS name`,
      );
      if (rows[0]?.name !== "aitcom_test") {
        throw new Error(
          `Refusing to migrate "${rows[0]?.name}"; use aitcom_test.`,
        );
      }
      await migration.up({ db } as never);
    }, 120_000);

    beforeEach(async () => {
      suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writerId = `mag-staff-writer-${suffix}`;
      assignerId = `mag-staff-assigner-${suffix}`;
      // Bare users: profiles and community memberships do not cascade on user
      // deletion and would prevent exercising this table's own foreign keys.
      await db.execute(sql`
        INSERT INTO "app"."user" ("id", "email", "name")
        VALUES (${writerId}, ${`${writerId}@example.test`}, 'Writer'),
          (${assignerId}, ${`${assignerId}@example.test`}, 'Assigner')
      `);
      const { rows } = await db.execute<{ id: number }>(sql`
        INSERT INTO "public"."magazines" ("name", "slug", "community_id", "created_by")
        VALUES ('Staff test', ${`staff-${suffix}`}, ${`community-${suffix}`}, ${assignerId})
        RETURNING "id"
      `);
      magazineId = rows[0]!.id;
    });

    afterEach(async () => {
      await db.execute(sql`
        DELETE FROM "app"."magazine_staff" WHERE "user_id" IN (${writerId}, ${assignerId})
      `);
      await db.execute(sql`
        DELETE FROM "public"."magazines" WHERE "id" = ${magazineId}
      `);
      await db.execute(sql`
        DELETE FROM "app"."user" WHERE "id" IN (${writerId}, ${assignerId})
      `);
    });

    it("creates the staff table and can run twice", async () => {
      await migration.up({ db } as never);
      await migration.up({ db } as never);
      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
      const { rows } = await db.execute<{ name: string }>(sql`
        SELECT indexname AS name FROM pg_indexes
        WHERE schemaname = 'app' AND tablename = 'magazine_staff'
      `);
      expect(rows.map((row) => row.name)).toContain("magazine_staff_user_idx");
    });

    it("allows one role per person per magazine and only the three roles", async () => {
      for (const role of ["editor_in_chief", "editor", "contributor"]) {
        await insertStaff(db, role);
        await expectViolation("editor", "23505");
        await db.execute(sql`
          DELETE FROM "app"."magazine_staff" WHERE "magazine_id" = ${magazineId}
        `);
      }
      await expectViolation("owner", "23514");
    });

    it("removes staff rows with their magazine and their user", async () => {
      await insertStaff();
      const rollback = new Error("rollback magazine deletion");
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`
            DELETE FROM "public"."magazines" WHERE "id" = ${magazineId}
          `);
          const { rows } = await tx.execute(sql`
            SELECT * FROM "app"."magazine_staff" WHERE "magazine_id" = ${magazineId}
          `);
          expect(rows).toEqual([]);
          throw rollback;
        }),
      ).rejects.toBe(rollback);

      await db.execute(
        sql`DELETE FROM "app"."user" WHERE "id" = ${assignerId}`,
      );
      const { rows } = await db.execute<{ assignedBy: string | null }>(sql`
        SELECT "assigned_by" AS "assignedBy" FROM "app"."magazine_staff"
        WHERE "magazine_id" = ${magazineId} AND "user_id" = ${writerId}
      `);
      expect(rows).toEqual([{ assignedBy: null }]);
      await db.execute(sql`DELETE FROM "app"."user" WHERE "id" = ${writerId}`);
      const remaining = await db.execute(sql`
        SELECT * FROM "app"."magazine_staff" WHERE "magazine_id" = ${magazineId}
      `);
      expect(remaining.rows).toEqual([]);
    });

    it("down drops the table, up restores it", async () => {
      // Keep any other suite's rows when exercising destructive DDL.
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await migration.down({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual([]);
          await migration.up({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual(EXPECTED_COLUMNS);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
    });
  },
);
