// @vitest-environment node
// Applies only to aitcom_test; the tables remain available to the other suites.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type {
  down as Down,
  up as Up,
} from "./20261026b_magazine_platform_items";

function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const value = process.env.DATABASE_URL?.trim() ?? "";
  if (/neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(value)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    value,
  );
}

const EXPECTED_COLUMNS = [
  "magazine_issues_blocks_storyline.storyline_id",
  "magazine_issues_blocks_storyline.intro",
  "magazine_issues_blocks_news_item.news_item_id",
  "magazine_issues_blocks_news_item.intro",
  "magazine_issues_blocks_event.event_id",
  "magazine_issues_blocks_event.intro",
];

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261026b magazine platform items [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;
    let down: typeof Down;

    async function presentColumns(on: Pick<typeof Db, "execute"> = db) {
      const { rows } = await on.execute<{ key: string }>(sql`
      SELECT table_name || '.' || column_name AS key
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (
        'magazine_issues_blocks_storyline', 'magazine_issues_blocks_news_item',
        'magazine_issues_blocks_event'
      )
    `);
      const have = new Set(rows.map((row) => row.key));
      return EXPECTED_COLUMNS.filter((key) => have.has(key));
    }

    beforeAll(async () => {
      const [database, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261026b_magazine_platform_items"),
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

    it("creates the block tables and can run twice", async () => {
      await up({ db } as never);
      await up({ db } as never);
      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
    });

    it("down removes them, up restores them", async () => {
      // Preserve any platform blocks other DB suites have already saved.
      const rollback = new Error("rollback migration exercise");
      await expect(
        db.transaction(async (tx) => {
          await down({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual([]);
          await up({ db: tx } as never);
          expect(await presentColumns(tx)).toEqual(EXPECTED_COLUMNS);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      expect(await presentColumns()).toEqual(EXPECTED_COLUMNS);
    });
  },
);
