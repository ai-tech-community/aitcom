// Consecutive empty and failed careers scans, so the daily jobs cron can
// wait longer before revisiting a company that keeps returning nothing.
// The wait is capped in the scanner; these counters only remember the run.
// Idempotent: ADD COLUMN IF NOT EXISTS is a no-op once the columns exist.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "jobs_empty_streak" integer NOT NULL DEFAULT 0;
  `);
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "jobs_fail_streak" integer NOT NULL DEFAULT 0;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "jobs_fail_streak";
  `);
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "jobs_empty_streak";
  `);
}
