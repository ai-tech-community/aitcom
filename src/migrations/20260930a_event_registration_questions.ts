// Registration questions on events and the answers on each registration
// (#369). Additive: events have no questions and registrations no answers
// until an organizer adds some.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "registration_questions" jsonb;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_registration_questions" jsonb;

    ALTER TABLE "app"."event_registration"
      ADD COLUMN IF NOT EXISTS "answers" jsonb NOT NULL DEFAULT '{}'::jsonb;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."event_registration" DROP COLUMN IF EXISTS "answers";
    ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_registration_questions";
    ALTER TABLE "events" DROP COLUMN IF EXISTS "registration_questions";
  `);
}
