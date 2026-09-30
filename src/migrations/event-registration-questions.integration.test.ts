// @vitest-environment node
// DB integration for migration 20260930a, called exactly like the deploy
// runner (`{ db }` only) and twice, since a failed deploy re-runs it.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20260930a_event_registration_questions";

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
  "migration 20260930a registration questions [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;

    beforeAll(async () => {
      const [dbMod, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20260930a_event_registration_questions"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
    }, 120_000);

    it("adds the columns and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      const res = await db.execute(sql`
        SELECT table_schema, table_name, column_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE (table_name = 'events' AND column_name = 'registration_questions')
           OR (table_name = '_events_v' AND column_name = 'version_registration_questions')
           OR (table_schema = 'app' AND table_name = 'event_registration' AND column_name = 'answers')
        ORDER BY table_name`);
      const columns = res.rows as {
        table_name: string;
        is_nullable: string;
        column_default: string | null;
      }[];

      expect(columns.map((c) => c.table_name).sort()).toEqual([
        "_events_v",
        "event_registration",
        "events",
      ]);
      const answers = columns.find(
        (c) => c.table_name === "event_registration",
      );
      expect(answers).toMatchObject({ is_nullable: "NO" });
      expect(answers?.column_default).toContain("'{}'");
    });
  },
);
