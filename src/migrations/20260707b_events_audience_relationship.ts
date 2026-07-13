import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Migrates `events.audience` from a `select hasMany` (junction tables
 * `events_audience` / `_events_v_version_audience`, backed by
 * `enum_events_audience` / `enum__events_v_version_audience`) to a
 * `relationship hasMany` pointing at the new `audiences` collection
 * (20260707a_audiences_collection_seed.ts). Resolves rows by the audience's
 * `slug` (== the legacy enum value for the first six audiences), never by
 * hardcoded row id — ids differ per environment.
 *
 * `events_rels` / `_events_v_rels` already exist (created outside hand
 * migrations, pre-dating the "hand-written Payload migrations" convention;
 * they already carry `speakers_id`/`media_id` columns for the `speakers`
 * relationship — see 20260419_events_discovery_metadata.ts). This migration
 * adds an `audiences_id` column to both, shape confirmed via
 * `npx payload generate:db-schema` run against the updated `Events.ts`
 * field def (schema-file output only, no DB writes) — FK name
 * `events_rels_audiences_fk` / `_events_v_rels_audiences_fk`, index
 * `events_rels_audiences_id_idx` / `_events_v_rels_audiences_id_idx`.
 *
 * Everything below is issued as a single multi-statement `db.execute` call
 * so Postgres runs it as one implicit transaction (simple-query protocol):
 * if the count-parity assertions raise, the column adds and inserts from
 * earlier in this same call roll back too — the old junction tables are
 * never dropped on a failed/partial migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- ── events_rels / _events_v_rels: add the audiences_id column ──────────
    ALTER TABLE "events_rels" ADD COLUMN IF NOT EXISTS "audiences_id" integer;
    CREATE INDEX IF NOT EXISTS "events_rels_audiences_id_idx" ON "events_rels" USING btree ("audiences_id");
    ALTER TABLE "events_rels" DROP CONSTRAINT IF EXISTS "events_rels_audiences_fk";
    ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_audiences_fk"
      FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;

    ALTER TABLE "_events_v_rels" ADD COLUMN IF NOT EXISTS "audiences_id" integer;
    CREATE INDEX IF NOT EXISTS "_events_v_rels_audiences_id_idx" ON "_events_v_rels" USING btree ("audiences_id");
    ALTER TABLE "_events_v_rels" DROP CONSTRAINT IF EXISTS "_events_v_rels_audiences_fk";
    ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_audiences_fk"
      FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;

    -- ── data migration: junction rows → rel rows, resolved by slug ─────────
    -- Guarded by to_regclass: on a fresh database the legacy junction tables
    -- never existed, so the data-move and its parity assert have nothing to
    -- do (#209). plpgsql resolves table names per-statement at first
    -- execution, so the guarded bodies never touch the missing tables.
    DO $$
    DECLARE
      junction_count integer;
      rel_count integer;
    BEGIN
      IF to_regclass('public.events_audience') IS NULL THEN
        RETURN;
      END IF;

      INSERT INTO "events_rels" ("order", "parent_id", "path", "audiences_id")
      SELECT ea."order", ea."parent_id", 'audience', a."id"
      FROM "events_audience" ea
      JOIN "audiences" a ON a."slug" = ea."value"::text
      WHERE NOT EXISTS (
        SELECT 1 FROM "events_rels" er
        WHERE er."parent_id" = ea."parent_id"
          AND er."path" = 'audience'
          AND er."order" = ea."order"
      );

      -- safety net: row-count parity before we drop the old source data
      SELECT count(*) INTO junction_count FROM "events_audience";
      SELECT count(*) INTO rel_count FROM "events_rels" WHERE "path" = 'audience';
      IF rel_count <> junction_count THEN
        RAISE EXCEPTION
          'events_audience -> events_rels count mismatch: % junction rows vs % rel rows (unmapped enum value / missing audience slug?)',
          junction_count, rel_count;
      END IF;
    END $$;

    DO $$
    DECLARE
      junction_count integer;
      rel_count integer;
    BEGIN
      IF to_regclass('public._events_v_version_audience') IS NULL THEN
        RETURN;
      END IF;

      INSERT INTO "_events_v_rels" ("order", "parent_id", "path", "audiences_id")
      SELECT va."order", va."parent_id", 'audience', a."id"
      FROM "_events_v_version_audience" va
      JOIN "audiences" a ON a."slug" = va."value"::text
      WHERE NOT EXISTS (
        SELECT 1 FROM "_events_v_rels" vr
        WHERE vr."parent_id" = va."parent_id"
          AND vr."path" = 'audience'
          AND vr."order" = va."order"
      );

      -- safety net: row-count parity before we drop the old source data
      SELECT count(*) INTO junction_count FROM "_events_v_version_audience";
      SELECT count(*) INTO rel_count FROM "_events_v_rels" WHERE "path" = 'audience';
      IF rel_count <> junction_count THEN
        RAISE EXCEPTION
          '_events_v_version_audience -> _events_v_rels count mismatch: % junction rows vs % rel rows (unmapped enum value / missing audience slug?)',
          junction_count, rel_count;
      END IF;
    END $$;

    -- ── drop the old select-hasMany storage ─────────────────────────────────
    DROP TABLE IF EXISTS "events_audience" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_events_audience";
    DROP TABLE IF EXISTS "_events_v_version_audience" CASCADE;
    DROP TYPE IF EXISTS "public"."enum__events_v_version_audience";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Best-effort: recreates the enum + junction-table shape and backfills
  // from events_rels/_events_v_rels, then removes the audiences_id column.
  // Only the 6 legacy enum values can round-trip through the enum cast —
  // any event data-migration-era audience newly assigned via the
  // relationship (e.g. "executives", the 7th audience with no legacy
  // enum equivalent) is dropped by the WHERE filter below rather than
  // failing the whole rollback.
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_events_audience" AS ENUM ('engineers', 'founders', 'marketers', 'product', 'researchers', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__events_v_version_audience" AS ENUM ('engineers', 'founders', 'marketers', 'product', 'researchers', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "events_audience" (
      "order" integer NOT NULL,
      "parent_id" integer NOT NULL,
      "value" "public"."enum_events_audience",
      "id" serial PRIMARY KEY NOT NULL
    );
    ALTER TABLE "events_audience" DROP CONSTRAINT IF EXISTS "events_audience_parent_fk";
    ALTER TABLE "events_audience" ADD CONSTRAINT "events_audience_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "events_audience_order_idx" ON "events_audience" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "events_audience_parent_idx" ON "events_audience" USING btree ("parent_id");

    CREATE TABLE IF NOT EXISTS "_events_v_version_audience" (
      "order" integer NOT NULL,
      "parent_id" integer NOT NULL,
      "value" "public"."enum__events_v_version_audience",
      "id" serial PRIMARY KEY NOT NULL
    );
    ALTER TABLE "_events_v_version_audience" DROP CONSTRAINT IF EXISTS "_events_v_version_audience_parent_fk";
    ALTER TABLE "_events_v_version_audience" ADD CONSTRAINT "_events_v_version_audience_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "_events_v_version_audience_order_idx" ON "_events_v_version_audience" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "_events_v_version_audience_parent_idx" ON "_events_v_version_audience" USING btree ("parent_id");

    INSERT INTO "events_audience" ("order", "parent_id", "value")
    SELECT er."order", er."parent_id", a."slug"::"public"."enum_events_audience"
    FROM "events_rels" er
    JOIN "audiences" a ON a."id" = er."audiences_id"
    WHERE er."path" = 'audience'
      AND a."slug" IN ('engineers', 'founders', 'marketers', 'product', 'researchers', 'mixed');

    INSERT INTO "_events_v_version_audience" ("order", "parent_id", "value")
    SELECT vr."order", vr."parent_id", a."slug"::"public"."enum__events_v_version_audience"
    FROM "_events_v_rels" vr
    JOIN "audiences" a ON a."id" = vr."audiences_id"
    WHERE vr."path" = 'audience'
      AND a."slug" IN ('engineers', 'founders', 'marketers', 'product', 'researchers', 'mixed');

    DELETE FROM "events_rels" WHERE "path" = 'audience';
    DELETE FROM "_events_v_rels" WHERE "path" = 'audience';

    ALTER TABLE "events_rels" DROP CONSTRAINT IF EXISTS "events_rels_audiences_fk";
    DROP INDEX IF EXISTS "events_rels_audiences_id_idx";
    ALTER TABLE "events_rels" DROP COLUMN IF EXISTS "audiences_id";

    ALTER TABLE "_events_v_rels" DROP CONSTRAINT IF EXISTS "_events_v_rels_audiences_fk";
    DROP INDEX IF EXISTS "_events_v_rels_audiences_id_idx";
    ALTER TABLE "_events_v_rels" DROP COLUMN IF EXISTS "audiences_id";
  `);
}
