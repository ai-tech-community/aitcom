// @vitest-environment node
// DB integration for migration 20261003a, called like the deploy runner
// (`{ db }` only) and twice, since a failed deploy re-runs it.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261003a_collector_runs";

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
  "migration 20261003a collector runs [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;

    beforeAll(async () => {
      const [dbMod, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261003a_collector_runs"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
    }, 120_000);

    it("creates the three collector tables and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      const result = await db.execute(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name IN ('collector_run', 'collector_item', 'collector_blocked_domain')
      `);
      const rows = ((result as { rows?: unknown }).rows ?? result) as {
        table_name: string;
        column_name: string;
      }[];
      const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
      for (const col of [
        "collector_run.id",
        "collector_run.user_id",
        "collector_run.agent_id",
        "collector_run.origin",
        "collector_run.collector_id",
        "collector_run.collector_version",
        "collector_run.input",
        "collector_run.status",
        "collector_run.stop_reason",
        "collector_run.attempts",
        "collector_run.lease_until",
        "collector_run.pages_fetched",
        "collector_run.bytes_fetched",
        "collector_run.item_count",
        "collector_run.invalid_item_count",
        "collector_run.duration_ms",
        "collector_run.error",
        "collector_run.log",
        "collector_run.created_at",
        "collector_run.started_at",
        "collector_run.finished_at",
        "collector_run.expires_at",
        "collector_item.run_id",
        "collector_item.seq",
        "collector_item.data",
        "collector_blocked_domain.domain",
        "collector_blocked_domain.reason",
        "collector_blocked_domain.created_at",
      ]) {
        expect(have.has(col), col).toBe(true);
      }
    });

    it("guards origin and status with CHECK constraints", async () => {
      const result = await db.execute(sql`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'app.collector_run'::regclass AND contype = 'c'
      `);
      const rows = ((result as { rows?: unknown }).rows ?? result) as {
        conname: string;
      }[];
      expect(rows.map((r) => r.conname).sort()).toEqual([
        "collector_run_origin_chk",
        "collector_run_status_chk",
      ]);
    });
  },
);
