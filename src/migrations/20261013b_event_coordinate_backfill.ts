// Fills latitude/longitude for public events inserted by SQL. Those inserts
// skip the Payload geocode hook, so the map had nothing to pin. Idempotent:
// a row that already has both coordinates is left alone, including one
// geocoded earlier through Payload.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import {
  EVENT_COORDINATE_BACKFILL,
  EVENT_COORDINATES_AT,
} from "@/lib/events/event-coordinates";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const row of EVENT_COORDINATE_BACKFILL) {
    await db.execute(sql`
      UPDATE "events"
      SET
        "latitude" = ${row.latitude},
        "longitude" = ${row.longitude},
        "geocoded_at" = ${EVENT_COORDINATES_AT}
      WHERE "slug" = ${row.slug}
        AND ("latitude" IS NULL OR "longitude" IS NULL);
    `);
    await db.execute(sql`
      UPDATE "_events_v"
      SET
        "version_latitude" = ${row.latitude},
        "version_longitude" = ${row.longitude},
        "version_geocoded_at" = ${EVENT_COORDINATES_AT}
      WHERE "parent_id" IN (
        SELECT "id" FROM "events" WHERE "slug" = ${row.slug}
      )
        AND ("version_latitude" IS NULL OR "version_longitude" IS NULL);
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const row of EVENT_COORDINATE_BACKFILL) {
    await db.execute(sql`
      UPDATE "events"
      SET
        "latitude" = NULL,
        "longitude" = NULL,
        "geocoded_at" = NULL
      WHERE "slug" = ${row.slug}
        AND "latitude" = ${row.latitude}
        AND "longitude" = ${row.longitude}
        AND "geocoded_at" = ${EVENT_COORDINATES_AT};
    `);
    await db.execute(sql`
      UPDATE "_events_v"
      SET
        "version_latitude" = NULL,
        "version_longitude" = NULL,
        "version_geocoded_at" = NULL
      WHERE "parent_id" IN (
        SELECT "id" FROM "events" WHERE "slug" = ${row.slug}
      )
        AND "version_latitude" = ${row.latitude}
        AND "version_longitude" = ${row.longitude}
        AND "version_geocoded_at" = ${EVENT_COORDINATES_AT};
    `);
  }
}
