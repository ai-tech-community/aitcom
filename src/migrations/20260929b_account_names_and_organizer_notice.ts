// First/last name on the account and the organizer-notice timestamp on each
// registration (ADR-0038, #369 slice 2). Additive; no backfill: names are
// asked at the next registration, and registrations made before the notice
// keep a null timestamp (the organizer then sees name and status only).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."user"
      ADD COLUMN IF NOT EXISTS "first_name" varchar(100),
      ADD COLUMN IF NOT EXISTS "last_name" varchar(100);

    ALTER TABLE "app"."event_registration"
      ADD COLUMN IF NOT EXISTS "organizer_notice_at" timestamp with time zone;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."event_registration" DROP COLUMN IF EXISTS "organizer_notice_at";
    ALTER TABLE "app"."user"
      DROP COLUMN IF EXISTS "last_name",
      DROP COLUMN IF EXISTS "first_name";
  `);
}
