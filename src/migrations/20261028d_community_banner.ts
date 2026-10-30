// Community banner URL. DDL only: a nullable column, no backfill.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
      ADD COLUMN IF NOT EXISTS "banner_url" text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."community"
      DROP COLUMN IF EXISTS "banner_url";
  `);
}
