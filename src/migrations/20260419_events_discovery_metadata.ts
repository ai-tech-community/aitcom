import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_events_format" AS ENUM ('online', 'in-person', 'hybrid');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_events_focus" AS ENUM ('technical', 'marketing', 'product', 'research', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_events_level" AS ENUM ('junior', 'mid', 'senior', 'expert', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_events_review_status" AS ENUM ('discovered', 'reviewing', 'approved', 'archived');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum_events_audience" AS ENUM ('engineers', 'founders', 'marketers', 'product', 'researchers', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__events_v_version_format" AS ENUM ('online', 'in-person', 'hybrid');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__events_v_version_focus" AS ENUM ('technical', 'marketing', 'product', 'research', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__events_v_version_level" AS ENUM ('junior', 'mid', 'senior', 'expert', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__events_v_version_review_status" AS ENUM ('discovered', 'reviewing', 'approved', 'archived');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      CREATE TYPE "public"."enum__events_v_version_audience" AS ENUM ('engineers', 'founders', 'marketers', 'product', 'researchers', 'mixed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE "events"
      ADD COLUMN IF NOT EXISTS "summary" varchar,
      ADD COLUMN IF NOT EXISTS "format" "enum_events_format",
      ADD COLUMN IF NOT EXISTS "region" varchar,
      ADD COLUMN IF NOT EXISTS "country" varchar,
      ADD COLUMN IF NOT EXISTS "city" varchar,
      ADD COLUMN IF NOT EXISTS "focus" "enum_events_focus",
      ADD COLUMN IF NOT EXISTS "level" "enum_events_level",
      ADD COLUMN IF NOT EXISTS "audience" jsonb,
      ADD COLUMN IF NOT EXISTS "source_url" varchar,
      ADD COLUMN IF NOT EXISTS "ait_fit_score" numeric,
      ADD COLUMN IF NOT EXISTS "curated_by_agent" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "discovery_source" varchar,
      ADD COLUMN IF NOT EXISTS "confidence_score" numeric,
      ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "review_status" "enum_events_review_status" DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS "cover_image_id" integer,
      ADD COLUMN IF NOT EXISTS "video_url" varchar;

    ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_cover_image_fk";
    ALTER TABLE "events" ADD CONSTRAINT "events_cover_image_fk"
      FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "events_cover_image_idx" ON "events" USING btree ("cover_image_id");

    ALTER TABLE "events_locales"
      ADD COLUMN IF NOT EXISTS "summary" varchar;

    ALTER TABLE "events_rels"
      ADD COLUMN IF NOT EXISTS "media_id" integer;
    CREATE INDEX IF NOT EXISTS "events_rels_media_id_idx" ON "events_rels" USING btree ("media_id");
    ALTER TABLE "events_rels" DROP CONSTRAINT IF EXISTS "events_rels_media_fk";
    ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_media_fk"
      FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;

    CREATE TABLE IF NOT EXISTS "events_tags" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "tag" varchar NOT NULL
    );
    ALTER TABLE "events_tags" DROP CONSTRAINT IF EXISTS "events_tags_parent_id_fk";
    ALTER TABLE "events_tags" ADD CONSTRAINT "events_tags_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "events_tags_order_idx" ON "events_tags" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "events_tags_parent_id_idx" ON "events_tags" USING btree ("_parent_id");

    ALTER TABLE "_events_v"
      ADD COLUMN IF NOT EXISTS "version_summary" varchar,
      ADD COLUMN IF NOT EXISTS "version_format" "enum__events_v_version_format",
      ADD COLUMN IF NOT EXISTS "version_region" varchar,
      ADD COLUMN IF NOT EXISTS "version_country" varchar,
      ADD COLUMN IF NOT EXISTS "version_city" varchar,
      ADD COLUMN IF NOT EXISTS "version_focus" "enum__events_v_version_focus",
      ADD COLUMN IF NOT EXISTS "version_level" "enum__events_v_version_level",
      ADD COLUMN IF NOT EXISTS "version_audience" jsonb,
      ADD COLUMN IF NOT EXISTS "version_source_url" varchar,
      ADD COLUMN IF NOT EXISTS "version_ait_fit_score" numeric,
      ADD COLUMN IF NOT EXISTS "version_curated_by_agent" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "version_discovery_source" varchar,
      ADD COLUMN IF NOT EXISTS "version_confidence_score" numeric,
      ADD COLUMN IF NOT EXISTS "version_last_verified_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "version_review_status" "enum__events_v_version_review_status" DEFAULT 'approved',
      ADD COLUMN IF NOT EXISTS "version_cover_image_id" integer,
      ADD COLUMN IF NOT EXISTS "version_video_url" varchar;

    ALTER TABLE "_events_v" DROP CONSTRAINT IF EXISTS "_events_v_version_cover_image_fk";
    ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_cover_image_fk"
      FOREIGN KEY ("version_cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;

    CREATE INDEX IF NOT EXISTS "_events_v_version_cover_image_idx" ON "_events_v" USING btree ("version_cover_image_id");

    ALTER TABLE "_events_v_locales"
      ADD COLUMN IF NOT EXISTS "version_summary" varchar;

    ALTER TABLE "_events_v_rels"
      ADD COLUMN IF NOT EXISTS "media_id" integer;
    CREATE INDEX IF NOT EXISTS "_events_v_rels_media_id_idx" ON "_events_v_rels" USING btree ("media_id");
    ALTER TABLE "_events_v_rels" DROP CONSTRAINT IF EXISTS "_events_v_rels_media_fk";
    ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_media_fk"
      FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;

    CREATE TABLE IF NOT EXISTS "_events_v_version_tags" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" serial PRIMARY KEY NOT NULL,
      "tag" varchar NOT NULL,
      "_uuid" varchar
    );
    ALTER TABLE "_events_v_version_tags" DROP CONSTRAINT IF EXISTS "_events_v_version_tags_parent_id_fk";
    ALTER TABLE "_events_v_version_tags" ADD CONSTRAINT "_events_v_version_tags_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
    CREATE INDEX IF NOT EXISTS "_events_v_version_tags_order_idx" ON "_events_v_version_tags" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "_events_v_version_tags_parent_id_idx" ON "_events_v_version_tags" USING btree ("_parent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "events_tags" CASCADE;
    DROP TABLE IF EXISTS "_events_v_version_tags" CASCADE;

    ALTER TABLE "events_rels" DROP CONSTRAINT IF EXISTS "events_rels_media_fk";
    DROP INDEX IF EXISTS "events_rels_media_id_idx";
    ALTER TABLE "events_rels" DROP COLUMN IF EXISTS "media_id";

    ALTER TABLE "_events_v_rels" DROP CONSTRAINT IF EXISTS "_events_v_rels_media_fk";
    DROP INDEX IF EXISTS "_events_v_rels_media_id_idx";
    ALTER TABLE "_events_v_rels" DROP COLUMN IF EXISTS "media_id";

    ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_cover_image_fk";
    DROP INDEX IF EXISTS "events_cover_image_idx";
    ALTER TABLE "events"
      DROP COLUMN IF EXISTS "summary",
      DROP COLUMN IF EXISTS "format",
      DROP COLUMN IF EXISTS "region",
      DROP COLUMN IF EXISTS "country",
      DROP COLUMN IF EXISTS "city",
      DROP COLUMN IF EXISTS "focus",
      DROP COLUMN IF EXISTS "level",
      DROP COLUMN IF EXISTS "audience",
      DROP COLUMN IF EXISTS "source_url",
      DROP COLUMN IF EXISTS "ait_fit_score",
      DROP COLUMN IF EXISTS "curated_by_agent",
      DROP COLUMN IF EXISTS "discovery_source",
      DROP COLUMN IF EXISTS "confidence_score",
      DROP COLUMN IF EXISTS "last_verified_at",
      DROP COLUMN IF EXISTS "review_status",
      DROP COLUMN IF EXISTS "cover_image_id",
      DROP COLUMN IF EXISTS "video_url";

    ALTER TABLE "events_locales" DROP COLUMN IF EXISTS "summary";

    ALTER TABLE "_events_v" DROP CONSTRAINT IF EXISTS "_events_v_version_cover_image_fk";
    DROP INDEX IF EXISTS "_events_v_version_cover_image_idx";
    ALTER TABLE "_events_v"
      DROP COLUMN IF EXISTS "version_summary",
      DROP COLUMN IF EXISTS "version_format",
      DROP COLUMN IF EXISTS "version_region",
      DROP COLUMN IF EXISTS "version_country",
      DROP COLUMN IF EXISTS "version_city",
      DROP COLUMN IF EXISTS "version_focus",
      DROP COLUMN IF EXISTS "version_level",
      DROP COLUMN IF EXISTS "version_audience",
      DROP COLUMN IF EXISTS "version_source_url",
      DROP COLUMN IF EXISTS "version_ait_fit_score",
      DROP COLUMN IF EXISTS "version_curated_by_agent",
      DROP COLUMN IF EXISTS "version_discovery_source",
      DROP COLUMN IF EXISTS "version_confidence_score",
      DROP COLUMN IF EXISTS "version_last_verified_at",
      DROP COLUMN IF EXISTS "version_review_status",
      DROP COLUMN IF EXISTS "version_cover_image_id",
      DROP COLUMN IF EXISTS "version_video_url";

    ALTER TABLE "_events_v_locales" DROP COLUMN IF EXISTS "version_summary";

    DROP TYPE IF EXISTS "public"."enum_events_format";
    DROP TYPE IF EXISTS "public"."enum_events_focus";
    DROP TYPE IF EXISTS "public"."enum_events_level";
    DROP TYPE IF EXISTS "public"."enum_events_review_status";
    DROP TYPE IF EXISTS "public"."enum_events_audience";
    DROP TYPE IF EXISTS "public"."enum__events_v_version_format";
    DROP TYPE IF EXISTS "public"."enum__events_v_version_focus";
    DROP TYPE IF EXISTS "public"."enum__events_v_version_level";
    DROP TYPE IF EXISTS "public"."enum__events_v_version_review_status";
    DROP TYPE IF EXISTS "public"."enum__events_v_version_audience";
  `);
}
