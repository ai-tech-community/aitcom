// Follow-up to the recorded builder-event seeds. Those migrations will not
// run again. This upserts six staff-cleared events only, by slug, from the
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
  "the-amsterdam-ai-summit-2026",
  "say-hello-eindhoven-2026",
  "tedxamsterdam-2026",
  "ai-data-science-day-2026",
  "big-data-conference-europe-2026",
  "aws-reinvent-2026",
] as const;

const SEEDED_AT = BUILDER_PUBLIC_EVENTS_SEEDED_AT;

/** Lowest public price, or the access line, copied into both locales. */
const PRICE_LINES: Record<
  (typeof NEW_SLUGS)[number],
  { en: string; nl: string }
> = {
  "the-amsterdam-ai-summit-2026": {
    en: "General Admission €34.99",
    nl: "General Admission €34,99",
  },
  "say-hello-eindhoven-2026": {
    en: "registration required",
    nl: "registratie verplicht",
  },
  "tedxamsterdam-2026": { en: "from €47.60", nl: "vanaf €47,60" },
  "ai-data-science-day-2026": {
    en: "registration required",
    nl: "registratie verplicht",
  },
  "big-data-conference-europe-2026": {
    en: "1-day onsite €450 excl. VAT",
    nl: "1 dag onsite €450 excl. btw",
  },
  "aws-reinvent-2026": { en: "full price $2,499", nl: "volle prijs $2,499" },
};

const NO_FREE_CLAIM = [
  "say-hello-eindhoven-2026",
  "ai-data-science-day-2026",
] as const;

function newEvents() {
  return NEW_SLUGS.map((slug) => {
    const event = BUILDER_PUBLIC_EVENTS.find((row) => row.slug === slug);
    if (!event) {
      throw new Error(`${slug} is missing from BUILDER_PUBLIC_EVENTS`);
    }
    const line = PRICE_LINES[slug];
    if (
      !event.summary.en.includes(line.en) ||
      !event.summary.nl.includes(line.nl)
    ) {
      throw new Error(`${slug} summary is missing its price line`);
    }
    if (
      (NO_FREE_CLAIM as readonly string[]).includes(slug) &&
      (/\bfree\b/i.test(event.summary.en) ||
        /\bgratis\b/i.test(event.summary.nl))
    ) {
      throw new Error(`${slug} must not say the event is free`);
    }
    if (slug === "aws-reinvent-2026") {
      const ignite = BUILDER_PUBLIC_EVENTS.find(
        (row) => row.slug === "microsoft-ignite-2026",
      );
      if (event.isAi !== ignite?.isAi) {
        throw new Error(
          "aws-reinvent-2026 is_ai must match microsoft-ignite-2026",
        );
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
