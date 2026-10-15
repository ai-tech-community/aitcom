// Nullable uses_ai flag. The directory was AI-only; the column starts null
// so this migration does not rewrite rows. ADD COLUMN without a default is
// metadata-only on Postgres 11+ and stays inside the 120s deploy limit.
// The backfill is not part of this migration: /api/cron/startup-uses-ai
// sets uses_ai = true for rows listed through the cutoff, in batches.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "uses_ai" boolean;
    CREATE INDEX IF NOT EXISTS "startup_uses_ai_idx"
      ON "app"."startup" USING btree ("uses_ai");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."startup_uses_ai_idx";
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "uses_ai";
  `);
}
