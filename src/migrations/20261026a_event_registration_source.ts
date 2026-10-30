import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."event_registration"
      ADD COLUMN IF NOT EXISTS "registration_source" varchar(32) NOT NULL DEFAULT 'direct_or_unknown',
      ADD COLUMN IF NOT EXISTS "attributed_at" timestamptz;
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."event_registration"
      DROP COLUMN IF EXISTS "registration_source",
      DROP COLUMN IF EXISTS "attributed_at";
  `);
}
