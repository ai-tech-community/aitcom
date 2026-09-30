// Check-in (#369): when the event organizer confirmed at the door that a
// registered member came. Additive; no backfill (nobody was checked in).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."event_registration"
      ADD COLUMN IF NOT EXISTS "checked_in_at" timestamp with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."event_registration" DROP COLUMN IF EXISTS "checked_in_at";
  `);
}
