import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- Add 'rejected' to the events status enum (safe: ADD VALUE is non-transactional in PG)
    DO $$ BEGIN
      ALTER TYPE "public"."enum_events_status" ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TYPE "public"."enum__events_v_version_status" ADD VALUE IF NOT EXISTS 'rejected';
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    -- submitted_by stores the app.user.id of the community member who submitted the event
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "submitted_by" varchar;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_submitted_by" varchar;

    CREATE INDEX IF NOT EXISTS "events_submitted_by_idx" ON "events" USING btree ("submitted_by");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    -- Postgres does not support removing enum values; leave enum intact
    DROP INDEX IF EXISTS "events_submitted_by_idx";
    ALTER TABLE "events" DROP COLUMN IF EXISTS "submitted_by";
    ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_submitted_by";
  `);
}
