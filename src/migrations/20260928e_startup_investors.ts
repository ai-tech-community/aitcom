// Additive sourced-only investors on Startups.
// Same jsonb shape and empty-array default as founders. No seed backfill.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "investors" jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "investors";
  `);
}
