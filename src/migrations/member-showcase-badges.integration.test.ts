// @vitest-environment node
// DB integration for migration 20261002b, called exactly like the deploy
// runner (`{ db }` only) and twice, since a failed deploy re-runs it.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261002b_member_showcase_badges";

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
  "migration 20261002b member showcase badges [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;

    beforeAll(async () => {
      const [dbMod, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261002b_member_showcase_badges"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
    }, 120_000);

    it("adds member_profile.showcase_badges with its cap, and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      const columns = await db.execute(sql`
        SELECT data_type, udt_name, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'member_profile'
          AND column_name = 'showcase_badges'`);
      expect(columns.rows).toEqual([
        {
          data_type: "ARRAY",
          udt_name: "_text",
          is_nullable: "NO",
          column_default: "'{}'::text[]",
        },
      ]);

      const checks = await db.execute(sql`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conname = 'member_profile_showcase_badges_max'
          AND conrelid = '"app"."member_profile"'::regclass`);
      expect(checks.rows).toHaveLength(1);
      expect(String(checks.rows[0]?.def)).toMatch(
        /CHECK \(\(?cardinality\(showcase_badges\) <= 3\)?\)/,
      );
    });
  },
);
