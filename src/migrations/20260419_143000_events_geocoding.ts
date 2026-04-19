import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "latitude" numeric,
      ADD COLUMN IF NOT EXISTS "longitude" numeric,
      ADD COLUMN IF NOT EXISTS "geocoded_at" timestamp(3) with time zone;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_latitude" numeric,
      ADD COLUMN IF NOT EXISTS "version_longitude" numeric,
      ADD COLUMN IF NOT EXISTS "version_geocoded_at" timestamp(3) with time zone;

    CREATE INDEX IF NOT EXISTS "events_latitude_idx" ON "events" USING btree ("latitude");
    CREATE INDEX IF NOT EXISTS "events_longitude_idx" ON "events" USING btree ("longitude");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "events_latitude_idx";
    DROP INDEX IF EXISTS "events_longitude_idx";

    ALTER TABLE "events"
      DROP COLUMN IF EXISTS "latitude",
      DROP COLUMN IF EXISTS "longitude",
      DROP COLUMN IF EXISTS "geocoded_at";

    ALTER TABLE "_events_v"
      DROP COLUMN IF EXISTS "version_latitude",
      DROP COLUMN IF EXISTS "version_longitude",
      DROP COLUMN IF EXISTS "version_geocoded_at";
  `);
}
