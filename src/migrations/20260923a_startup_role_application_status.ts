// Private board status on a member's tracked startup role.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup_role_application"
      ADD COLUMN IF NOT EXISTS "status" varchar(32) NOT NULL DEFAULT 'applying';

    ALTER TABLE "app"."startup_role_application"
      DROP CONSTRAINT IF EXISTS "startup_role_application_status_check";

    ALTER TABLE "app"."startup_role_application"
      ADD CONSTRAINT "startup_role_application_status_check"
      CHECK ("status" IN ('applying', 'applied', 'talking', 'offer', 'passed'));
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup_role_application"
      DROP CONSTRAINT IF EXISTS "startup_role_application_status_check";

    ALTER TABLE "app"."startup_role_application"
      DROP COLUMN IF EXISTS "status";
  `);
}
