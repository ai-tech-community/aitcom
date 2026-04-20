import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Backfill events.summary into events_locales.summary (en locale) and
 * events.audience jsonb into the events_audience junction table, then drop
 * the stale columns. Same treatment for _events_v / _events_v_locales /
 * _events_v_version_audience.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- ── events.summary → events_locales.summary ('en') ────────────────────────
    INSERT INTO "events_locales" ("_locale", "_parent_id", "summary")
    SELECT 'en'::"_locales", e.id, e.summary
    FROM "events" e
    WHERE e.summary IS NOT NULL
    ON CONFLICT ("_locale", "_parent_id") DO UPDATE
      SET "summary" = COALESCE("events_locales"."summary", EXCLUDED."summary");

    -- ── events.audience (jsonb) → events_audience junction ────────────────────
    INSERT INTO "events_audience" ("order", "parent_id", "value")
    SELECT (a.ordinality - 1)::int, e.id, a.val::"enum_events_audience"
    FROM "events" e
    CROSS JOIN LATERAL jsonb_array_elements_text(e.audience)
      WITH ORDINALITY a(val, ordinality)
    WHERE e.audience IS NOT NULL
      AND jsonb_typeof(e.audience) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM "events_audience" ea WHERE ea.parent_id = e.id
      );

    -- ── _events_v.version_summary → _events_v_locales.version_summary ────────
    INSERT INTO "_events_v_locales" ("_locale", "_parent_id", "version_summary")
    SELECT 'en'::"_locales", v.id, v.version_summary
    FROM "_events_v" v
    WHERE v.version_summary IS NOT NULL
    ON CONFLICT ("_locale", "_parent_id") DO UPDATE
      SET "version_summary" = COALESCE(
        "_events_v_locales"."version_summary",
        EXCLUDED."version_summary"
      );

    -- ── _events_v.version_audience (jsonb) → _events_v_version_audience ──────
    INSERT INTO "_events_v_version_audience" ("order", "parent_id", "value")
    SELECT (a.ordinality - 1)::int, v.id,
           a.val::"enum__events_v_version_audience"
    FROM "_events_v" v
    CROSS JOIN LATERAL jsonb_array_elements_text(v.version_audience)
      WITH ORDINALITY a(val, ordinality)
    WHERE v.version_audience IS NOT NULL
      AND jsonb_typeof(v.version_audience) = 'array'
      AND NOT EXISTS (
        SELECT 1 FROM "_events_v_version_audience" va
        WHERE va.parent_id = v.id
      );

    -- ── Drop the stale columns ────────────────────────────────────────────────
    ALTER TABLE "events"
      DROP COLUMN IF EXISTS "summary",
      DROP COLUMN IF EXISTS "audience";

    ALTER TABLE "_events_v"
      DROP COLUMN IF EXISTS "version_summary",
      DROP COLUMN IF EXISTS "version_audience";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Recreate the dropped columns and copy data back. Best-effort for audience
  // (loses ordering of duplicates but none exist per unique junction).
  await db.execute(sql`
    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "summary" varchar,
      ADD COLUMN IF NOT EXISTS "audience" jsonb;

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_summary" varchar,
      ADD COLUMN IF NOT EXISTS "version_audience" jsonb;

    UPDATE "events" e
    SET "summary" = el.summary
    FROM "events_locales" el
    WHERE el._parent_id = e.id AND el._locale = 'en'::"_locales";

    UPDATE "_events_v" v
    SET "version_summary" = vl.version_summary
    FROM "_events_v_locales" vl
    WHERE vl._parent_id = v.id AND vl._locale = 'en'::"_locales";

    UPDATE "events" e
    SET "audience" = sub.vals
    FROM (
      SELECT parent_id,
             jsonb_agg(value::text ORDER BY "order") AS vals
      FROM "events_audience"
      GROUP BY parent_id
    ) sub
    WHERE sub.parent_id = e.id;

    UPDATE "_events_v" v
    SET "version_audience" = sub.vals
    FROM (
      SELECT parent_id,
             jsonb_agg(value::text ORDER BY "order") AS vals
      FROM "_events_v_version_audience"
      GROUP BY parent_id
    ) sub
    WHERE sub.parent_id = v.id;
  `);
}
