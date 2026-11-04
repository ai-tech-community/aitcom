// Looking-for-a-cofounder and hiring flags on startup profiles. Both default
// false. A constant DEFAULT is metadata-only on Postgres 11+ (no table
// rewrite), so this stays DDL-only and inside the 120s deploy limit.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "looking_for_cofounder" boolean NOT NULL DEFAULT false;
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "hiring" boolean NOT NULL DEFAULT false;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup" DROP COLUMN IF EXISTS "looking_for_cofounder";
    ALTER TABLE "app"."startup" DROP COLUMN IF EXISTS "hiring";
  `);
}
