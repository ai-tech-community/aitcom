import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// Backing column for the Events collection's `challengeId` field (text, indexed):
// the event↔challenge binding that turns an event into a hackathon (ADR-0029).
// The field shipped in src/collections/Events.ts but its column was never
// migrated, so Payload's events query selects a non-existent "challenge_id" and
// fails. This adds the column on both the live table and the `_events_v` version
// table, plus the matching indexes. Purely additive — IF NOT EXISTS throughout,
// no data is dropped.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "challenge_id" varchar;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_challenge_id" varchar;

    CREATE INDEX IF NOT EXISTS "events_challenge_id_idx" ON "events" USING btree ("challenge_id");
    CREATE INDEX IF NOT EXISTS "_events_v_version_challenge_id_idx" ON "_events_v" USING btree ("version_challenge_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "events_challenge_id_idx";
    DROP INDEX IF EXISTS "_events_v_version_challenge_id_idx";
    ALTER TABLE "events" DROP COLUMN IF EXISTS "challenge_id";
    ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_challenge_id";
  `);
}
