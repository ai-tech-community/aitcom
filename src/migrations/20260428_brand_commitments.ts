import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."brand"
      ADD COLUMN IF NOT EXISTS "commitment_renewable_pct" numeric,
      ADD COLUMN IF NOT EXISTS "commitment_target_year" integer,
      ADD COLUMN IF NOT EXISTS "commitment_source_url" text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."brand"
      DROP COLUMN IF EXISTS "commitment_renewable_pct",
      DROP COLUMN IF EXISTS "commitment_target_year",
      DROP COLUMN IF EXISTS "commitment_source_url";
  `);
}
