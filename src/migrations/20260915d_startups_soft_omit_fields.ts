// Additive sourced-only fields for Startups cards.
// founders / exit / jobs stay null or [] unless Ops-passed. No people-graph backfill.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      ADD COLUMN IF NOT EXISTS "founders" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "exit_status" varchar(16),
      ADD COLUMN IF NOT EXISTS "acquirer" text,
      ADD COLUMN IF NOT EXISTS "exit_on" date,
      ADD COLUMN IF NOT EXISTS "jobs_url" text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."startup"
      DROP COLUMN IF EXISTS "founders",
      DROP COLUMN IF EXISTS "exit_status",
      DROP COLUMN IF EXISTS "acquirer",
      DROP COLUMN IF EXISTS "exit_on",
      DROP COLUMN IF EXISTS "jobs_url";
  `);
}
