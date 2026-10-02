// @vitest-environment node
// DB integration for migration 20261002a, called exactly like the deploy
// runner (`{ db }` only) and twice, since a failed deploy re-runs it.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261002a_member_awards";

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
  "migration 20261002a member awards [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;

    beforeAll(async () => {
      const [dbMod, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261002a_member_awards"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
    }, 120_000);

    it("creates member_award and member_badge.seen_at, and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      const columns = await db.execute(sql`
        SELECT table_name, column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND (table_name = 'member_award'
            OR (table_name = 'member_badge' AND column_name = 'seen_at'))
        ORDER BY table_name, ordinal_position`);
      expect(columns.rows).toEqual([
        {
          table_name: "member_award",
          column_name: "id",
          data_type: "character varying",
          is_nullable: "NO",
        },
        {
          table_name: "member_award",
          column_name: "user_id",
          data_type: "character varying",
          is_nullable: "NO",
        },
        {
          table_name: "member_award",
          column_name: "challenge_id",
          data_type: "integer",
          is_nullable: "NO",
        },
        {
          table_name: "member_award",
          column_name: "label",
          data_type: "character varying",
          is_nullable: "NO",
        },
        {
          table_name: "member_award",
          column_name: "earned_at",
          data_type: "timestamp with time zone",
          is_nullable: "NO",
        },
        {
          table_name: "member_award",
          column_name: "seen_at",
          data_type: "timestamp with time zone",
          is_nullable: "YES",
        },
        {
          table_name: "member_badge",
          column_name: "seen_at",
          data_type: "timestamp with time zone",
          is_nullable: "YES",
        },
      ]);

      const unique = await db.execute(sql`
        SELECT indexdef FROM pg_indexes
        WHERE schemaname = 'app'
          AND indexname = 'member_award_user_challenge_label_uidx'`);
      expect(String(unique.rows[0]?.indexdef)).toMatch(
        /UNIQUE INDEX .*\(user_id, challenge_id, label\)/,
      );
    });
  },
);
