import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { AUDIENCE_SEED } from "@/lib/audience-seed";

/**
 * Creates the `audiences` collection's Payload-postgres tables by hand
 * (house precedent: 20260420_events_summary_audience_backfill.ts) and seeds
 * the 7 editorial audiences (src/lib/audience-seed.ts). Slugs are the stable
 * public vocabulary — the first six exactly equal the legacy
 * `EVENT_AUDIENCE_OPTIONS` enum values so a later task can migrate
 * `events.audience` from a select to a relationship without renaming data.
 *
 * `audiences` has no `versions: { drafts: true }`, so unlike `events` there
 * are no `_audiences_v_*` version twins to handle.
 *
 * Table shapes were derived from `payload generate:db-schema` run against
 * this collection's config (schema file only, no DB writes) and
 * cross-checked against the live DB's analogous structures:
 *   - `events_audience` for the select-hasMany-inside-array shape
 *     (`audiences_preferred_slots_weekdays`, 1-based `order`/`_order`,
 *     confirmed against live `events_audience` rows).
 *   - `payload_locked_documents_rels` for the per-collection admin-lock
 *     column every collection needs (house precedent:
 *     20260608d_locked_docs_rels.ts) — without it, admin document
 *     create/update on `audiences` would fail.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    -- ── base table ───────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS "audiences" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "audiences_slug_idx" ON "audiences" USING btree ("slug");
    CREATE INDEX IF NOT EXISTS "audiences_updated_at_idx" ON "audiences" USING btree ("updated_at");
    CREATE INDEX IF NOT EXISTS "audiences_created_at_idx" ON "audiences" USING btree ("created_at");

    -- ── interests: array<{ tag }> ────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS "audiences_interests" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "tag" varchar NOT NULL
    );
    ALTER TABLE "audiences_interests" DROP CONSTRAINT IF EXISTS "audiences_interests_parent_id_fk";
    ALTER TABLE "audiences_interests" ADD CONSTRAINT "audiences_interests_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "audiences_interests_order_idx" ON "audiences_interests" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "audiences_interests_parent_id_idx" ON "audiences_interests" USING btree ("_parent_id");

    -- ── preferredSlots: array<{ weekdays[], startTime, endTime }> ──────────
    CREATE TABLE IF NOT EXISTS "audiences_preferred_slots" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "start_time" varchar NOT NULL,
      "end_time" varchar NOT NULL
    );
    ALTER TABLE "audiences_preferred_slots" DROP CONSTRAINT IF EXISTS "audiences_preferred_slots_parent_id_fk";
    ALTER TABLE "audiences_preferred_slots" ADD CONSTRAINT "audiences_preferred_slots_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "audiences_preferred_slots_order_idx" ON "audiences_preferred_slots" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "audiences_preferred_slots_parent_id_idx" ON "audiences_preferred_slots" USING btree ("_parent_id");

    DO $$ BEGIN
      CREATE TYPE "public"."enum_audiences_preferred_slots_weekdays" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS "audiences_preferred_slots_weekdays" (
      "order" integer NOT NULL,
      "parent_id" varchar NOT NULL,
      "value" "public"."enum_audiences_preferred_slots_weekdays",
      "id" serial PRIMARY KEY NOT NULL
    );
    ALTER TABLE "audiences_preferred_slots_weekdays" DROP CONSTRAINT IF EXISTS "audiences_preferred_slots_weekdays_parent_fk";
    ALTER TABLE "audiences_preferred_slots_weekdays" ADD CONSTRAINT "audiences_preferred_slots_weekdays_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."audiences_preferred_slots"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "audiences_preferred_slots_weekdays_order_idx" ON "audiences_preferred_slots_weekdays" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "audiences_preferred_slots_weekdays_parent_idx" ON "audiences_preferred_slots_weekdays" USING btree ("parent_id");

    -- ── relatedAudiences: self relationship, hasMany ───────────────────────
    CREATE TABLE IF NOT EXISTS "audiences_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "audiences_id" integer
    );
    ALTER TABLE "audiences_rels" DROP CONSTRAINT IF EXISTS "audiences_rels_parent_fk";
    ALTER TABLE "audiences_rels" ADD CONSTRAINT "audiences_rels_parent_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
    ALTER TABLE "audiences_rels" DROP CONSTRAINT IF EXISTS "audiences_rels_audiences_fk";
    ALTER TABLE "audiences_rels" ADD CONSTRAINT "audiences_rels_audiences_fk"
      FOREIGN KEY ("audiences_id") REFERENCES "public"."audiences"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "audiences_rels_order_idx" ON "audiences_rels" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "audiences_rels_parent_idx" ON "audiences_rels" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "audiences_rels_path_idx" ON "audiences_rels" USING btree ("path");
    CREATE INDEX IF NOT EXISTS "audiences_rels_audiences_id_idx" ON "audiences_rels" USING btree ("audiences_id");

    -- ── admin document-lock support (every collection needs a column here,
    -- see 20260608d_locked_docs_rels.ts) ────────────────────────────────────
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "audiences_id" integer REFERENCES "audiences"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_audiences_id_idx" ON "payload_locked_documents_rels"("audiences_id");
  `);

  // ── seed the 7 editorial audiences, their interests and preferred slots ──
  for (const audience of AUDIENCE_SEED) {
    await db.execute(sql`
      INSERT INTO "audiences" ("name", "slug")
      VALUES (${audience.name}, ${audience.slug})
      ON CONFLICT ("slug") DO NOTHING;
    `);

    for (const [i, tag] of audience.interests.entries()) {
      await db.execute(sql`
        INSERT INTO "audiences_interests" ("_order", "_parent_id", "id", "tag")
        SELECT ${i + 1}, a."id", gen_random_uuid()::text, ${tag}
        FROM "audiences" a
        WHERE a."slug" = ${audience.slug}
          AND NOT EXISTS (
            SELECT 1 FROM "audiences_interests" ai
            WHERE ai."_parent_id" = a."id" AND ai."tag" = ${tag}
          );
      `);
    }

    for (const [s, slot] of audience.preferredSlots.entries()) {
      await db.execute(sql`
        INSERT INTO "audiences_preferred_slots" ("_order", "_parent_id", "id", "start_time", "end_time")
        SELECT ${s + 1}, a."id", gen_random_uuid()::text, ${slot.startTime}, ${slot.endTime}
        FROM "audiences" a
        WHERE a."slug" = ${audience.slug}
          AND NOT EXISTS (
            SELECT 1 FROM "audiences_preferred_slots" aps
            WHERE aps."_parent_id" = a."id"
              AND aps."start_time" = ${slot.startTime}
              AND aps."end_time" = ${slot.endTime}
          );
      `);

      for (const [w, day] of slot.weekdays.entries()) {
        await db.execute(sql`
          INSERT INTO "audiences_preferred_slots_weekdays" ("order", "parent_id", "value")
          SELECT ${w + 1}, aps."id", ${day}::"public"."enum_audiences_preferred_slots_weekdays"
          FROM "audiences_preferred_slots" aps
          JOIN "audiences" a ON a."id" = aps."_parent_id"
          WHERE a."slug" = ${audience.slug}
            AND aps."start_time" = ${slot.startTime}
            AND aps."end_time" = ${slot.endTime}
            AND NOT EXISTS (
              SELECT 1 FROM "audiences_preferred_slots_weekdays" existing
              WHERE existing."parent_id" = aps."id" AND existing."order" = ${w + 1}
            );
        `);
      }
    }
  }

  // ── related-audience links — second pass, once all 7 rows exist ─────────
  for (const audience of AUDIENCE_SEED) {
    for (const [r, relatedSlug] of audience.relatedAudiences.entries()) {
      await db.execute(sql`
        INSERT INTO "audiences_rels" ("order", "parent_id", "path", "audiences_id")
        SELECT ${r + 1}, src."id", 'relatedAudiences', dst."id"
        FROM "audiences" src, "audiences" dst
        WHERE src."slug" = ${audience.slug}
          AND dst."slug" = ${relatedSlug}
          AND NOT EXISTS (
            SELECT 1 FROM "audiences_rels" ar
            WHERE ar."parent_id" = src."id"
              AND ar."path" = 'relatedAudiences'
              AND ar."audiences_id" = dst."id"
          );
      `);
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "audiences_id";

    DROP TABLE IF EXISTS "audiences_rels" CASCADE;
    DROP TABLE IF EXISTS "audiences_preferred_slots_weekdays" CASCADE;
    DROP TABLE IF EXISTS "audiences_preferred_slots" CASCADE;
    DROP TABLE IF EXISTS "audiences_interests" CASCADE;
    DROP TABLE IF EXISTS "audiences" CASCADE;
    DROP TYPE IF EXISTS "public"."enum_audiences_preferred_slots_weekdays";
  `);
}
