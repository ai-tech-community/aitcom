import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// Backing column for the Events collection's `timezone` field (#166): the
// IANA timezone the event's wall-clock startTime/endTime are expressed in.
// Added on both the live table and the `_events_v` version table. Purely
// additive — IF NOT EXISTS throughout, no data is dropped.
//
// Backfill decision: existing rows get 'Europe/Amsterdam'
// (DEFAULT_EVENT_TIMEZONE in src/lib/event-time.ts). The platform's home
// market is Amsterdam/NL — the site ships an nl locale and historical events
// are overwhelmingly Dutch meetups — so the platform-home zone is a far more
// accurate fallback than UTC for the existing catalogue. Organizers can edit
// the field afterwards for the handful of non-NL curated events.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "timezone" varchar;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_timezone" varchar;

    UPDATE "events"
      SET "timezone" = 'Europe/Amsterdam'
      WHERE "timezone" IS NULL;

    UPDATE "_events_v"
      SET "version_timezone" = 'Europe/Amsterdam'
      WHERE "version_timezone" IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events" DROP COLUMN IF EXISTS "timezone";
    ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_timezone";
  `);
}
