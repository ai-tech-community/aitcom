// Adds judging_opened_at to the Payload challenges table (gates judge ranking).
// challenges is a Payload-managed table, so this mirrors the column-type spelling
// Payload's Drizzle adapter emits for a `date` field — `timestamp(3) with time
// zone` (see 20260419_143000_events_geocoding) — NOT the `timestamptz` used for
// the drizzle-managed `app` schema tables. Purely additive.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "challenges"
      ADD COLUMN IF NOT EXISTS "judging_opened_at" timestamp(3) with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "challenges" DROP COLUMN IF EXISTS "judging_opened_at";
  `);
}
