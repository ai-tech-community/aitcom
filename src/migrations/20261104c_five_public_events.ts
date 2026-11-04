// Follow-up to the recorded builder-event seeds. Those migrations will not
// run again. This upserts five staff-cleared 2027 events only, by slug, from
// the shared seed. Same locales and version rows as the shared upsert. Then
// stamps last_verified_at with the Europe/Amsterdam check time. Does not set
// attendance or images. Does not touch any other event.
//
// https://odsc.ai/east/ is not in this batch. That page shows May 10–May 12
// with no year, and its speaker lists are still labeled 2026.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import {
  BUILDER_PUBLIC_EVENTS,
  BUILDER_PUBLIC_EVENTS_CHECKED_AT,
  BUILDER_PUBLIC_EVENTS_SEEDED_AT,
} from "@/lib/events/builder-public-events";
import {
  EVENT_COORDINATE_BACKFILL,
  EVENT_COORDINATES_AT,
} from "@/lib/events/event-coordinates";
import { upsertBuilderEvent } from "./20260925a_builder_public_events";

const NEW_SLUGS = [
  "ai-engineer-europe-2027",
  "nvidia-gtc-san-jose-2027",
  "machine-learning-prague-2027",
  "the-ai-summit-london-2027",
  "data-ai-summit-2027",
] as const;

const SEEDED_AT = BUILDER_PUBLIC_EVENTS_SEEDED_AT;
const CHECKED_AT = BUILDER_PUBLIC_EVENTS_CHECKED_AT;

const DATES: Record<
  (typeof NEW_SLUGS)[number],
  { date: string; endDate: string }
> = {
  "ai-engineer-europe-2027": { date: "2027-02-17", endDate: "2027-02-19" },
  "nvidia-gtc-san-jose-2027": { date: "2027-03-15", endDate: "2027-03-18" },
  "machine-learning-prague-2027": {
    date: "2027-05-03",
    endDate: "2027-05-05",
  },
  "the-ai-summit-london-2027": { date: "2027-06-09", endDate: "2027-06-10" },
  "data-ai-summit-2027": { date: "2027-06-21", endDate: "2027-06-24" },
};

const SOURCE_URLS: Record<(typeof NEW_SLUGS)[number], string> = {
  "ai-engineer-europe-2027": "https://www.ai.engineer/",
  "nvidia-gtc-san-jose-2027": "https://www.nvidia.com/gtc/",
  "machine-learning-prague-2027": "https://www.mlprague.com/",
  "the-ai-summit-london-2027": "https://london.theaisummit.com/",
  "data-ai-summit-2027": "https://www.databricks.com/dataaisummit",
};

const NO_PRICE = [
  "ai-engineer-europe-2027",
  "nvidia-gtc-san-jose-2027",
  "the-ai-summit-london-2027",
  "data-ai-summit-2027",
] as const;

const ATTENDANCE =
  /\b(attendees?|participants?|deelnemers)\b|3[,.]?000|5[,.]?000|800\+/i;

function newEvents() {
  return NEW_SLUGS.map((slug) => {
    const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
    if (!event) {
      throw new Error(`${slug} is missing from BUILDER_PUBLIC_EVENTS`);
    }
    if (event.checkedAt !== CHECKED_AT) {
      throw new Error(`${slug} is missing the Europe/Amsterdam check time`);
    }
    if (
      event.date !== DATES[slug].date ||
      event.endDate !== DATES[slug].endDate
    ) {
      throw new Error(`${slug} dates do not match the official page`);
    }
    if (event.url !== SOURCE_URLS[slug]) {
      throw new Error(`${slug} source URL does not match the official page`);
    }
    if (event.isAi !== true) {
      throw new Error(`${slug} must store is_ai true`);
    }
    if (event.priceCents != null) {
      throw new Error(`${slug} must not store one euro price`);
    }
    if (
      ATTENDANCE.test(event.summary.en) ||
      ATTENDANCE.test(event.summary.nl) ||
      ATTENDANCE.test(event.title)
    ) {
      throw new Error(`${slug} must not store an attendance figure`);
    }
    if (slug === "machine-learning-prague-2027") {
      if (
        !event.summary.en.includes("virtual conference €210 + VAT") ||
        !event.summary.nl.includes("virtuele conferentie €210 + btw")
      ) {
        throw new Error(`${slug} summary is missing its price line`);
      }
      if (event.format !== "hybrid") {
        throw new Error(`${slug} is in person and online`);
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
    if (slug === "nvidia-gtc-san-jose-2027") {
      if (event.city !== "San Jose" || event.location !== "San Jose") {
        throw new Error(`${slug} stores the city only`);
      }
    }
    if (slug === "data-ai-summit-2027" && event.format !== "hybrid") {
      throw new Error(`${slug} is in San Francisco and virtual`);
    }
    return event;
  });
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const event of newEvents()) {
    await upsertBuilderEvent(db, event);
    await db.execute(sql`
      UPDATE "events"
      SET "last_verified_at" = ${CHECKED_AT}
      WHERE "slug" = ${event.slug};
    `);
    await db.execute(sql`
      UPDATE "_events_v"
      SET "version_last_verified_at" = ${CHECKED_AT}
      WHERE "parent_id" IN (
        SELECT "id" FROM "events" WHERE "slug" = ${event.slug}
      );
    `);
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
