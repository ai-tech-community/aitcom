// Follow-up to the recorded builder-event seeds. Those migrations will not
// run again. This upserts seven staff-cleared events only, by slug, from the
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
  "agentic-transformation-summit-amsterdam-2026",
  "sinterklaasintocht-amsterdam-2026",
  "handelsblatt-ai-summit-2026",
  "microsoft-ignite-2026",
  "welcome-to-the-hague-2026",
  "apidays-paris-2026",
  "the-ai-summit-new-york-2026",
] as const;

const SEEDED_AT = BUILDER_PUBLIC_EVENTS_SEEDED_AT;

/** Lowest public price, or the access line, copied into both locales. */
const PRICE_LINES: Partial<
  Record<(typeof NEW_SLUGS)[number], { en: string; nl: string }>
> = {
  "handelsblatt-ai-summit-2026": { en: "from €950", nl: "vanaf €950" },
  "microsoft-ignite-2026": {
    en: "free digital pass, then Hub pass $1,625",
    nl: "gratis digital pass, daarna Hub-pas $1,625",
  },
  "the-ai-summit-new-york-2026": {
    en: "Expo pass from $129",
    nl: "Expo-pas vanaf $129",
  },
  "agentic-transformation-summit-amsterdam-2026": {
    en: "from €1,799 + VAT",
    nl: "vanaf €1.799 + btw",
  },
  "welcome-to-the-hague-2026": {
    en: "registration required",
    nl: "registratie verplicht",
  },
  "sinterklaasintocht-amsterdam-2026": {
    en: "times approximate",
    nl: "tijden bij benadering",
  },
};

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
    if (
      slug === "welcome-to-the-hague-2026" &&
      (/\bfree\b/i.test(event.summary.en) ||
        /\bgratis\b/i.test(event.summary.nl))
    ) {
      throw new Error(`${slug} must not say the evening is free`);
    }
    if (
      slug === "microsoft-ignite-2026" &&
      (event.summary.en.includes("$325") || event.summary.nl.includes("$325"))
    ) {
      throw new Error(`${slug} must not mention the pre-day add-on`);
    }
    if (
      slug === "sinterklaasintocht-amsterdam-2026" &&
      event.title !== "Sinterklaasintocht in Amsterdam"
    ) {
      throw new Error(`${slug} title drifted from the official name`);
    }
    return event;
  });
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const event of newEvents()) {
    await upsertBuilderEvent(db, event);
  }

  // `20261013b`, `20261019a`, and `20261021a` are already recorded on
  // databases that have them, so they will not pin these rows. Write a
  // Nominatim point here only while latitude or longitude is null.
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
