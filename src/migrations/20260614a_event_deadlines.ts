// Adds the four hackathon timeline deadline columns to the Payload events table
// (registration / submission / judging gates + results announcement date), and
// mirrors them onto the _events_v version table (drafts are enabled — see
// 20260612c_event_timezone). All nullable: an unset deadline means "no enforced
// window" and preserves today's phase-driven behavior; no backfill needed.
// Payload-managed tables, so we use the `timestamp(3) with time zone` spelling its
// Drizzle adapter emits for `date` fields (see 20260613c_challenge_judging_opened).
// Purely additive.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "registration_deadline" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "submission_deadline"   timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "judging_deadline"      timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "results_date"          timestamp(3) with time zone;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_registration_deadline" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "version_submission_deadline"   timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "version_judging_deadline"      timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "version_results_date"          timestamp(3) with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      DROP COLUMN IF EXISTS "registration_deadline",
      DROP COLUMN IF EXISTS "submission_deadline",
      DROP COLUMN IF EXISTS "judging_deadline",
      DROP COLUMN IF EXISTS "results_date";

    ALTER TABLE "_events_v"
      DROP COLUMN IF EXISTS "version_registration_deadline",
      DROP COLUMN IF EXISTS "version_submission_deadline",
      DROP COLUMN IF EXISTS "version_judging_deadline",
      DROP COLUMN IF EXISTS "version_results_date";
  `);
}
