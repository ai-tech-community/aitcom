// Nullable is_ai flag on a sourced job. The column starts null so this
// migration does not rewrite rows. ADD COLUMN without a default is
// metadata-only on Postgres 11+ and stays inside the 120s deploy limit.
// The backfill is not part of this migration: /api/cron/startup-role-ai
// classifies title and description in batches.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup_role"
      ADD COLUMN IF NOT EXISTS "is_ai" boolean;
    CREATE INDEX IF NOT EXISTS "startup_role_is_ai_idx"
      ON "app"."startup_role" USING btree ("is_ai");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."startup_role_is_ai_idx";
    ALTER TABLE "app"."startup_role"
      DROP COLUMN IF EXISTS "is_ai";
  `);
}
