// @vitest-environment node
// Applies only to aitcom_test; the table remains available to the other suites.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type {
  down as Down,
  up as Up,
} from "./20261114b_magazine_gallery_items";

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const value = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(value)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    value,
  );
}

const TABLE = "magazine_issues_blocks_gallery_item";
const EXPECTED_COLUMNS = [
  "_order integer NO",
  "_parent_id integer NO",
  "_path text NO",
  "block_name character varying YES",
  "gallery_item_id numeric NO",
  "id character varying NO",
  "image jsonb YES",
  "intro character varying YES",
];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261114b magazine gallery items [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;
    let down: typeof Down;

    async function columns(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute<{ key: string }>(sql`
        SELECT column_name || ' ' || data_type || ' ' || is_nullable AS key
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${TABLE}
        ORDER BY column_name
      `);
      return rows.map((row) => row.key);
    }

    /** Foreign keys from the table: only the parent issue, never the item. */
    async function foreignKeys() {
      const { rows } = await db.execute<{ target: string }>(sql`
        SELECT ccu.table_name AS target
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public' AND tc.table_name = ${TABLE}
          AND tc.constraint_type = 'FOREIGN KEY'
      `);
      return rows.map((row) => row.target);
    }

    beforeAll(async () => {
      const [database, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261114b_magazine_gallery_items"),
      ]);
      db = database.db;
      sql = drizzle.sql;
      up = migration.up;
      down = migration.down;
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test") {
        throw new Error(
          `Refusing to migrate "${rows[0]?.name}"; use aitcom_test.`,
        );
      }
    }, 120_000);

    it("creates the block table with a plain item id and can run twice", async () => {
      await up({ db } as never);
      await up({ db } as never);
      expect(await columns()).toEqual(EXPECTED_COLUMNS);
      expect(await foreignKeys()).toEqual(["magazine_issues"]);
    });

    it("down removes it, up restores it", async () => {
      // Preserve any gallery blocks other DB suites have already saved.
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await down({ db: tx } as never);
          expect(await columns(tx)).toEqual([]);
          await up({ db: tx } as never);
          expect(await columns(tx)).toEqual(EXPECTED_COLUMNS);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await columns()).toEqual(EXPECTED_COLUMNS);
    });
  },
);
