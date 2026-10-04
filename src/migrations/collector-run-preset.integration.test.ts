// @vitest-environment node
// DB integration for migration 20261004a, called like the deploy runner
// (`{ db }` only) and twice, since a failed deploy re-runs it; then down and
// up again. This is also how the local test database gets the column: it
// refuses any database but aitcom_test, and leaves the column in place.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is set.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { down as Down, up as Up } from "./20261004a_collector_run_preset";

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

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261004a collector run preset [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;
    let down: typeof Down;

    /** The preset_id column as information_schema describes it. */
    async function presetColumn(on: Pick<typeof Db, "execute"> = db) {
      const result = await on.execute(sql`
        SELECT data_type, character_maximum_length, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'collector_run'
          AND column_name = 'preset_id'
      `);
      return ((result as { rows?: unknown }).rows ?? result) as {
        data_type: string;
        character_maximum_length: number;
        is_nullable: string;
      }[];
    }

    beforeAll(async () => {
      const [dbMod, drizzle, runs, detail, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261003a_collector_runs"),
        import("./20261003b_collector_run_error_detail"),
        import("./20261004a_collector_run_preset"),
      ]);
      db = dbMod.db;
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
      await runs.up({ db } as never);
      await detail.up({ db } as never);
    }, 120_000);

    it("adds a nullable varchar(64) preset_id column and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      expect(await presetColumn()).toEqual([
        {
          data_type: "character varying",
          character_maximum_length: 64,
          is_nullable: "YES",
        },
      ]);
    });

    it("drops the column on down and adds it back on up", async () => {
      // One transaction: other DB suites running in parallel never see the
      // table without the column (they wait on the lock until it is back).
      await db.transaction(async (tx) => {
        await down({ db: tx } as never);
        expect(await presetColumn(tx)).toEqual([]);
        await up({ db: tx } as never);
        expect(await presetColumn(tx)).toHaveLength(1);
      });
      // The test database keeps the column for every other suite.
      expect(await presetColumn()).toEqual([
        {
          data_type: "character varying",
          character_maximum_length: 64,
          is_nullable: "YES",
        },
      ]);
    });
  },
);
