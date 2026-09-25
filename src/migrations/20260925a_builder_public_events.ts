// Publishes the five ops-cleared events onto the fat `/events` listing.
// `/en/events` reads Payload `events` with status = published, _status =
// published (draft: false), and discovery_source ≠ luma. The parked
// curated_public_event table is not that listing.
//
// Idempotent upsert on slug. Does not set attendance, price, or images.
// Soft-retires a still-published Turku row (TEDAI replaces it) by setting
// status = cancelled and review_status = archived. Does not delete it.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import {
  BUILDER_PUBLIC_EVENTS,
  BUILDER_PUBLIC_EVENTS_SEEDED_AT,
  builderEventDescription,
  type BuilderPublicEvent,
} from "@/lib/events/builder-public-events";

const keptSlugs = sql.join(
  BUILDER_PUBLIC_EVENTS.map((event) => sql`${event.slug}`),
  sql`, `,
);

const SEEDED_AT = BUILDER_PUBLIC_EVENTS_SEEDED_AT;

async function upsertBuilderEvent(
  db: MigrateUpArgs["db"],
  event: BuilderPublicEvent,
): Promise<void> {
  const date = `${event.date}T12:00:00.000Z`;
  const descriptionEn = JSON.stringify(
    builderEventDescription(event.summary.en, event.url, "Official page:"),
  );
  const descriptionNl = JSON.stringify(
    builderEventDescription(event.summary.nl, event.url, "Officiële pagina:"),
  );

  await db.execute(sql`
    WITH upserted AS (
      INSERT INTO "events" (
        "slug", "type", "format", "location", "country", "city",
        "date", "timezone", "source_url", "discovery_source",
        "curated_by_agent", "review_status", "status", "_status",
        "last_verified_at", "created_at", "updated_at"
      ) VALUES (
        ${event.slug},
        'meetup'::"public"."enum_events_type",
        'in-person'::"public"."enum_events_format",
        ${event.location},
        ${event.country},
        ${event.city},
        ${date},
        ${event.timezone},
        ${event.url},
        'staff',
        false,
        'approved'::"public"."enum_events_review_status",
        'published'::"public"."enum_events_status",
        'published'::"public"."enum_events_status",
        ${SEEDED_AT},
        ${SEEDED_AT},
        ${SEEDED_AT}
      )
      ON CONFLICT ("slug") DO UPDATE SET
        "type" = EXCLUDED."type",
        "format" = EXCLUDED."format",
        "location" = EXCLUDED."location",
        "country" = EXCLUDED."country",
        "city" = EXCLUDED."city",
        "date" = EXCLUDED."date",
        "timezone" = EXCLUDED."timezone",
        "source_url" = EXCLUDED."source_url",
        "discovery_source" = EXCLUDED."discovery_source",
        "curated_by_agent" = EXCLUDED."curated_by_agent",
        "review_status" = EXCLUDED."review_status",
        "status" = EXCLUDED."status",
        "_status" = EXCLUDED."_status",
        "last_verified_at" = EXCLUDED."last_verified_at",
        "updated_at" = EXCLUDED."updated_at"
      RETURNING "id"
    ),
    locale_en AS (
      INSERT INTO "events_locales" (
        "_locale", "_parent_id", "title", "summary", "description"
      )
      SELECT
        'en'::"public"."enum__locales",
        u."id",
        ${event.title},
        ${event.summary.en},
        ${descriptionEn}::jsonb
      FROM upserted u
      ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
        "title" = EXCLUDED."title",
        "summary" = EXCLUDED."summary",
        "description" = EXCLUDED."description"
      RETURNING "_parent_id"
    ),
    locale_nl AS (
      INSERT INTO "events_locales" (
        "_locale", "_parent_id", "title", "summary", "description"
      )
      SELECT
        'nl'::"public"."enum__locales",
        u."id",
        ${event.title},
        ${event.summary.nl},
        ${descriptionNl}::jsonb
      FROM upserted u
      ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
        "title" = EXCLUDED."title",
        "summary" = EXCLUDED."summary",
        "description" = EXCLUDED."description"
      RETURNING "_parent_id"
    ),
    updated_version AS (
      UPDATE "_events_v" v
      SET
        "version_slug" = ${event.slug},
        "version_type" = 'meetup'::"public"."enum__events_v_version_type",
        "version_format" = 'in-person'::"public"."enum__events_v_version_format",
        "version_location" = ${event.location},
        "version_country" = ${event.country},
        "version_city" = ${event.city},
        "version_date" = ${date},
        "version_timezone" = ${event.timezone},
        "version_source_url" = ${event.url},
        "version_discovery_source" = 'staff',
        "version_curated_by_agent" = false,
        "version_review_status" = 'approved'::"public"."enum__events_v_version_review_status",
        "version_status" = 'published'::"public"."enum__events_v_version_status",
        "version__status" = 'published'::"public"."enum__events_v_version_status",
        "version_last_verified_at" = ${SEEDED_AT},
        "version_updated_at" = ${SEEDED_AT},
        "latest" = true,
        "snapshot" = false,
        "updated_at" = ${SEEDED_AT}
      WHERE v."id" = (
        SELECT v2."id"
        FROM "_events_v" v2
        WHERE v2."parent_id" = (SELECT "id" FROM upserted)
          AND v2."latest" IS TRUE
        ORDER BY v2."id" DESC
        LIMIT 1
      )
      RETURNING v."id"
    ),
    inserted_version AS (
      INSERT INTO "_events_v" (
        "parent_id", "version_slug", "version_type", "version_format",
        "version_location", "version_country", "version_city", "version_date",
        "version_timezone", "version_source_url", "version_discovery_source",
        "version_curated_by_agent", "version_review_status", "version_status",
        "version__status", "version_last_verified_at", "version_created_at",
        "version_updated_at", "created_at", "updated_at", "latest", "snapshot"
      )
      SELECT
        u."id",
        ${event.slug},
        'meetup'::"public"."enum__events_v_version_type",
        'in-person'::"public"."enum__events_v_version_format",
        ${event.location},
        ${event.country},
        ${event.city},
        ${date},
        ${event.timezone},
        ${event.url},
        'staff',
        false,
        'approved'::"public"."enum__events_v_version_review_status",
        'published'::"public"."enum__events_v_version_status",
        'published'::"public"."enum__events_v_version_status",
        ${SEEDED_AT},
        ${SEEDED_AT},
        ${SEEDED_AT},
        ${SEEDED_AT},
        ${SEEDED_AT},
        true,
        false
      FROM upserted u
      WHERE NOT EXISTS (SELECT 1 FROM updated_version)
      RETURNING "id"
    ),
    version_ids AS (
      SELECT "id" FROM updated_version
      UNION ALL
      SELECT "id" FROM inserted_version
    ),
    version_locale_en AS (
      INSERT INTO "_events_v_locales" (
        "_locale", "_parent_id", "version_title", "version_summary",
        "version_description"
      )
      SELECT
        'en'::"public"."enum__locales",
        v."id",
        ${event.title},
        ${event.summary.en},
        ${descriptionEn}::jsonb
      FROM version_ids v
      ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
        "version_title" = EXCLUDED."version_title",
        "version_summary" = EXCLUDED."version_summary",
        "version_description" = EXCLUDED."version_description"
      RETURNING "id"
    ),
    version_locale_nl AS (
      INSERT INTO "_events_v_locales" (
        "_locale", "_parent_id", "version_title", "version_summary",
        "version_description"
      )
      SELECT
        'nl'::"public"."enum__locales",
        v."id",
        ${event.title},
        ${event.summary.nl},
        ${descriptionNl}::jsonb
      FROM version_ids v
      ON CONFLICT ("_locale", "_parent_id") DO UPDATE SET
        "version_title" = EXCLUDED."version_title",
        "version_summary" = EXCLUDED."version_summary",
        "version_description" = EXCLUDED."version_description"
      RETURNING "id"
    )
    SELECT
      (SELECT "id" FROM upserted) AS event_id,
      (SELECT count(*) FROM locale_en) AS locale_en_count,
      (SELECT count(*) FROM locale_nl) AS locale_nl_count,
      (SELECT count(*) FROM version_locale_en) AS version_en_count,
      (SELECT count(*) FROM version_locale_nl) AS version_nl_count
  `);
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    WITH retired AS (
      UPDATE "events" e
      SET
        "status" = 'cancelled',
        "review_status" = 'archived',
        "updated_at" = ${SEEDED_AT}
      WHERE e."status" = 'published'
        AND e."slug" NOT IN (${keptSlugs})
        AND (
          e."slug" ILIKE '%turku%'
          OR COALESCE(e."city", '') ILIKE '%turku%'
          OR COALESCE(e."location", '') ILIKE '%turku%'
          OR EXISTS (
            SELECT 1
            FROM "events_locales" el
            WHERE el."_parent_id" = e."id"
              AND (
                COALESCE(el."title", '') ILIKE '%turku%'
                OR COALESCE(el."summary", '') ILIKE '%turku%'
              )
          )
        )
      RETURNING e."id"
    )
    UPDATE "_events_v" v
    SET
      "version_status" = 'cancelled',
      "version_review_status" = 'archived',
      "updated_at" = ${SEEDED_AT}
    WHERE v."parent_id" IN (SELECT "id" FROM retired)
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF to_regclass('app.curated_public_event') IS NOT NULL THEN
        DELETE FROM "app"."curated_public_event"
        WHERE "id" ILIKE '%turku%'
           OR "title" ILIKE '%turku%'
           OR COALESCE("city", '') ILIKE '%turku%'
           OR "url" ILIKE '%turku%';
      END IF;
    END $$;
  `);

  for (const event of BUILDER_PUBLIC_EVENTS) {
    await upsertBuilderEvent(db, event);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const event of BUILDER_PUBLIC_EVENTS) {
    await db.execute(sql`
      DELETE FROM "_events_v"
      WHERE "created_at" = ${SEEDED_AT}
        AND "parent_id" IN (
          SELECT "id" FROM "events" WHERE "slug" = ${event.slug}
        );
    `);
    await db.execute(sql`
      DELETE FROM "events"
      WHERE "slug" = ${event.slug}
        AND "created_at" = ${SEEDED_AT}
        AND "discovery_source" = 'staff';
    `);
  }
}
