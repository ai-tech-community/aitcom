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
  "big-data-ai-world-madrid-2026",
  "data-outpost-2026",
  "adopt-ai-2026",
  "ai-coding-summit-berlin-2026",
  "chatbot-summit-berlin-2027",
] as const;

const SEEDED_AT = BUILDER_PUBLIC_EVENTS_SEEDED_AT;

/** Lowest public price, copied into both locales. Madrid and Adopt AI have none. */
const PRICE_LINES: Partial<
  Record<(typeof NEW_SLUGS)[number], { en: string; nl: string }>
> = {
  "data-outpost-2026": { en: "$499", nl: "$499" },
  "ai-coding-summit-berlin-2026": { en: "€625", nl: "€625" },
  "chatbot-summit-berlin-2027": { en: "from €495", nl: "vanaf €495" },
};

const NO_PRICE = ["big-data-ai-world-madrid-2026", "adopt-ai-2026"] as const;

function newEvents() {
  return NEW_SLUGS.map((slug) => {
    const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
    if (!event) {
      throw new Error(`${slug} is missing from BUILDER_PUBLIC_EVENTS`);
    }
    const line = PRICE_LINES[slug];
    if (line) {
      if (
        !event.summary.en.includes(line.en) ||
        !event.summary.nl.includes(line.nl)
      ) {
        throw new Error(`${slug} summary is missing its price line`);
      }
    }
    if ((NO_PRICE as readonly string[]).includes(slug)) {
      if (
        /[$€]|\bfree\b/i.test(event.summary.en) ||
        /[$€]|\bgratis\b/i.test(event.summary.nl)
      ) {
        throw new Error(`${slug} must not state a price or say it is free`);
      }
    }
    if (slug === "adopt-ai-2026") {
      const attendance =
        /\b(attendees?|participants?|deelnemers)\b|20[,.]?000|27[,.]?000|\b800\b/i;
      if (
        attendance.test(event.summary.en) ||
        attendance.test(event.summary.nl) ||
        attendance.test(event.title)
      ) {
        throw new Error(`${slug} must not store an attendance figure`);
      }
    }
    if (slug === "ai-coding-summit-berlin-2026") {
      if (!event.title.includes("Berlin")) {
        throw new Error(`${slug} title must include Berlin`);
      }
      if (event.slug === "ai-coding-summit-nyc-2026") {
        throw new Error(`${slug} collided with the NYC summit`);
      }
      if (event.date !== "2026-12-04" || event.endDate !== "2026-12-04") {
        throw new Error(`${slug} must use 4 Dec 2026 as its event date`);
      }
      if (
        !event.summary.en.includes("7 Dec 2026") ||
        !event.summary.nl.includes("7 dec 2026")
      ) {
        throw new Error(`${slug} summary must name the remote day`);
      }
    }
    if (slug === "chatbot-summit-berlin-2027") {
      const tiers = /295|PRO PASS|MAX PASS|\btier/i;
      if (tiers.test(event.summary.en) || tiers.test(event.summary.nl)) {
        throw new Error(`${slug} must not name tiers or the old price`);
      }
    }
    return event;
  });
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const event of newEvents()) {
    await upsertBuilderEvent(db, event);
  }

  // Earlier coordinate migrations are already recorded on databases that
  // have them, so they will not pin these rows. Write a Nominatim point
  // here only while latitude or longitude is null.
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
