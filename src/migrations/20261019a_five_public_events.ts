// Follow-up to the recorded builder-event seeds. Those migrations will not
// run again. This upserts five staff-cleared events only, by slug, from the
// shared seed. Same locales and version rows as the shared upsert. Does not
// set attendance or images. Does not touch any other event.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import {
  BUILDER_PUBLIC_EVENTS,
  BUILDER_PUBLIC_EVENTS_SEEDED_AT,
} from "@/lib/events/builder-public-events";
import {
  EVENT_COORDINATE_BACKFILL,
  EVENT_COORDINATES_AT,
} from "@/lib/events/event-coordinates";
import { upsertBuilderEvent } from "./20260925a_builder_public_events";

const NEW_SLUGS = [
  "iamexpat-fair-the-hague-2026",
  "slush-2026",
  "ai-europe-congress-2026",
  "ukairs-2026",
  "ai-hpi-conference-2026",
] as const;

const SEEDED_AT = BUILDER_PUBLIC_EVENTS_SEEDED_AT;

function newEvents() {
  return NEW_SLUGS.map((slug) => {
    const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
    if (!event) {
      throw new Error(`${slug} is missing from BUILDER_PUBLIC_EVENTS`);
    }
    return event;
  });
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const event of newEvents()) {
    await upsertBuilderEvent(db, event);
  }

  // `20261013b` is already recorded on production, so it will not pin these
  // rows. A fresh database inserts them in `20260925a` and `20261013b` fills
  // the points. Write them here only while latitude or longitude is null.
  const points = new Map(
    EVENT_COORDINATE_BACKFILL.map((row) => [row.slug, row]),
  );
  for (const slug of NEW_SLUGS) {
    const row = points.get(slug);
    if (!row) {
      throw new Error(`${slug} is missing from EVENT_COORDINATE_BACKFILL`);
    }
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
  for (const slug of NEW_SLUGS) {
    await db.execute(sql`
      DELETE FROM "_events_v"
      WHERE "created_at" = ${SEEDED_AT}
        AND "parent_id" IN (
          SELECT "id" FROM "events" WHERE "slug" = ${slug}
        );
    `);
    await db.execute(sql`
      DELETE FROM "events"
      WHERE "slug" = ${slug}
        AND "created_at" = ${SEEDED_AT}
        AND "discovery_source" = 'staff';
    `);
  }
}
