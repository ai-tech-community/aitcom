// Adds nullable events.end_date and the drafts mirror version_end_date, then
// backfills multi-day public events whose official last day is already written
// on BUILDER_PUBLIC_EVENTS. A slug that is not in the database updates zero
// rows. No locale casts: production names that enum public._locales.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { BUILDER_PUBLIC_EVENTS } from "@/lib/events/builder-public-events";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "end_date" timestamp(3) with time zone;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_end_date" timestamp(3) with time zone;
  `);

  for (const event of BUILDER_PUBLIC_EVENTS) {
    if (!event.endDate) continue;
    const end = `${event.endDate}T12:00:00.000Z`;
    await db.execute(sql`
      UPDATE "events"
      SET "end_date" = ${end}
      WHERE "slug" = ${event.slug}
    `);
    await db.execute(sql`
      UPDATE "_events_v"
      SET "version_end_date" = ${end}
      WHERE "parent_id" IN (
        SELECT "id" FROM "events" WHERE "slug" = ${event.slug}
      )
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_end_date";
    ALTER TABLE "events" DROP COLUMN IF EXISTS "end_date";
  `);
}
