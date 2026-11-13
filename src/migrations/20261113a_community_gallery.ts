// Community gallery (spec 2026-11-13, ADR-0049), slice 1: the gallery_batches
// and gallery_items tables for the `gallery-batches` and `gallery-items`
// Payload collections, their select enums, the indexes Payload expects, and
// the admin-lock columns on payload_locked_documents_rels (every Payload
// update/delete by id reads one <collection>_id column per collection;
// without them they all fail — see 20260927a).
//
// Foreign keys follow Payload's own shape (ON DELETE set null). For the
// required gallery_items.batch_id that means a batch cannot be deleted while
// it still has items; the daily cleanup deletes only empty batches.
//
// It also gives every existing community the new Gallery tab: one builtin
// `gallery` space appended after its current last tab, so owners' custom
// orders are kept. A community that already has a space with the slug
// `gallery` is skipped. Additive and idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_gallery_batches_visibility" AS ENUM('community', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_gallery_batches_status" AS ENUM('open', 'finished');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_gallery_items_media_type" AS ENUM('photo', 'video');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_gallery_items_status" AS ENUM('uploading', 'ready', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_gallery_items_storage" AS ENUM('public', 'private');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_gallery_items_visibility" AS ENUM('community', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "gallery_batches" (
      "id" serial PRIMARY KEY,
      "community_id" varchar NOT NULL,
      "uploader_id" varchar NOT NULL,
      "event_id" integer,
      "topic_slug" varchar,
      "visibility" "enum_gallery_batches_visibility" DEFAULT 'community' NOT NULL,
      "magazine_consent" boolean DEFAULT false,
      "magazine_consent_at" timestamp(3) with time zone,
      "caption" varchar,
      "planned_files" numeric NOT NULL,
      "planned_videos" numeric NOT NULL,
      "status" "enum_gallery_batches_status" DEFAULT 'open' NOT NULL,
      "feed_post_id" numeric,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    DO $$ BEGIN
      ALTER TABLE "gallery_batches"
        ADD CONSTRAINT "gallery_batches_event_id_events_id_fk"
        FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "gallery_batches_community_id_idx" ON "gallery_batches"("community_id");
    CREATE INDEX IF NOT EXISTS "gallery_batches_uploader_id_idx" ON "gallery_batches"("uploader_id");
    CREATE INDEX IF NOT EXISTS "gallery_batches_event_idx" ON "gallery_batches"("event_id");
    CREATE INDEX IF NOT EXISTS "gallery_batches_status_idx" ON "gallery_batches"("status");
    CREATE INDEX IF NOT EXISTS "gallery_batches_updated_at_idx" ON "gallery_batches"("updated_at");
    CREATE INDEX IF NOT EXISTS "gallery_batches_created_at_idx" ON "gallery_batches"("created_at");

    CREATE TABLE IF NOT EXISTS "gallery_items" (
      "id" serial PRIMARY KEY,
      "community_id" varchar NOT NULL,
      "event_id" integer,
      "topic_slug" varchar,
      "media_type" "enum_gallery_items_media_type" NOT NULL,
      "status" "enum_gallery_items_status" DEFAULT 'uploading' NOT NULL,
      "failure_reason" varchar,
      "storage" "enum_gallery_items_storage" NOT NULL,
      "visibility" "enum_gallery_items_visibility" DEFAULT 'community' NOT NULL,
      "file_key" varchar NOT NULL,
      "thumbnail_key" varchar NOT NULL,
      "width" numeric NOT NULL,
      "height" numeric NOT NULL,
      "bytes" numeric NOT NULL,
      "duration_seconds" numeric,
      "caption" varchar,
      "alt" varchar,
      "uploader_id" varchar NOT NULL,
      "batch_id" integer NOT NULL,
      "upload_id" varchar NOT NULL,
      "magazine_consent" boolean DEFAULT false,
      "magazine_consent_at" timestamp(3) with time zone,
      "hidden_at" timestamp(3) with time zone,
      "report_count" numeric DEFAULT 0,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    DO $$ BEGIN
      ALTER TABLE "gallery_items"
        ADD CONSTRAINT "gallery_items_event_id_events_id_fk"
        FOREIGN KEY ("event_id") REFERENCES "public"."events"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "gallery_items"
        ADD CONSTRAINT "gallery_items_batch_id_gallery_batches_id_fk"
        FOREIGN KEY ("batch_id") REFERENCES "public"."gallery_batches"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "gallery_items_community_id_idx" ON "gallery_items"("community_id");
    CREATE INDEX IF NOT EXISTS "gallery_items_event_idx" ON "gallery_items"("event_id");
    CREATE INDEX IF NOT EXISTS "gallery_items_topic_slug_idx" ON "gallery_items"("topic_slug");
    CREATE INDEX IF NOT EXISTS "gallery_items_status_idx" ON "gallery_items"("status");
    CREATE UNIQUE INDEX IF NOT EXISTS "gallery_items_file_key_idx" ON "gallery_items"("file_key");
    CREATE INDEX IF NOT EXISTS "gallery_items_uploader_id_idx" ON "gallery_items"("uploader_id");
    CREATE INDEX IF NOT EXISTS "gallery_items_batch_idx" ON "gallery_items"("batch_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "gallery_items_upload_id_idx" ON "gallery_items"("upload_id");
    CREATE INDEX IF NOT EXISTS "gallery_items_hidden_at_idx" ON "gallery_items"("hidden_at");
    CREATE INDEX IF NOT EXISTS "gallery_items_updated_at_idx" ON "gallery_items"("updated_at");
    CREATE INDEX IF NOT EXISTS "gallery_items_created_at_idx" ON "gallery_items"("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "gallery_batches_id" integer REFERENCES "gallery_batches"("id") ON DELETE cascade,
      ADD COLUMN IF NOT EXISTS "gallery_items_id" integer REFERENCES "gallery_items"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_gallery_batches_id_idx"
      ON "payload_locked_documents_rels"("gallery_batches_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_gallery_items_id_idx"
      ON "payload_locked_documents_rels"("gallery_items_id");

    INSERT INTO "app"."space" ("id","community_id","kind","builtin_surface","slug","position")
    SELECT gen_random_uuid()::text, c."id", 'builtin', 'gallery', 'gallery',
           COALESCE((SELECT MAX(s."position") + 1 FROM "app"."space" s WHERE s."community_id" = c."id"), 0)
    FROM "app"."community" c
    WHERE NOT EXISTS (SELECT 1 FROM "app"."space" s WHERE s."community_id" = c."id" AND s."slug" = 'gallery');
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."space" WHERE "kind" = 'builtin' AND "builtin_surface" = 'gallery';
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "gallery_items_id",
      DROP COLUMN IF EXISTS "gallery_batches_id";
    DROP TABLE IF EXISTS "gallery_items";
    DROP TABLE IF EXISTS "gallery_batches";
    DROP TYPE IF EXISTS "public"."enum_gallery_items_media_type";
    DROP TYPE IF EXISTS "public"."enum_gallery_items_status";
    DROP TYPE IF EXISTS "public"."enum_gallery_items_storage";
    DROP TYPE IF EXISTS "public"."enum_gallery_items_visibility";
    DROP TYPE IF EXISTS "public"."enum_gallery_batches_visibility";
    DROP TYPE IF EXISTS "public"."enum_gallery_batches_status";
  `);
}
