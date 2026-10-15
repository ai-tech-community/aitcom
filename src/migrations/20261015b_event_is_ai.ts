// Nullable is_ai flag on an event. The column starts null so this
// migration does not rewrite rows. ADD COLUMN without a default is
// metadata-only on Postgres 11+ and stays inside the 120s deploy limit.
// The backfill is not part of this migration: /api/cron/event-ai
// classifies title, summary, and description in batches.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "is_ai" boolean;
    CREATE INDEX IF NOT EXISTS "events_is_ai_idx"
      ON "events" USING btree ("is_ai");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "events_is_ai_idx";
    ALTER TABLE "events"
      DROP COLUMN IF EXISTS "is_ai";
  `);
}
