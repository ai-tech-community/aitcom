// @vitest-environment node
// DB integration for migration 20261003b, called like the deploy runner
// (`{ db }` only) and twice, since a failed deploy re-runs it.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261003b_collector_run_error_detail";

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
  "migration 20261003b collector run error detail [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;

    beforeAll(async () => {
      const [dbMod, drizzle, base, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261003a_collector_runs"),
        import("./20261003b_collector_run_error_detail"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
      await base.up({ db } as never);
    }, 120_000);

    it("adds a nullable jsonb error_detail column and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      const result = await db.execute(sql`
        SELECT data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'collector_run'
          AND column_name = 'error_detail'
      `);
      const rows = ((result as { rows?: unknown }).rows ?? result) as {
        data_type: string;
        is_nullable: string;
      }[];
      expect(rows).toEqual([{ data_type: "jsonb", is_nullable: "YES" }]);
    });
  },
);
