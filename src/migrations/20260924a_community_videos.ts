// Community short videos (ADR-0036): video + visibility + moderation on
// feed_posts, plus post_reports and video_uploads. Every new collection also
// needs its admin-lock column on payload_locked_documents_rels (house
// precedent: 20260611b_modules_locked_docs_rels.ts).
//
// feed_posts.video_key is UNIQUE (Payload name for a unique group subfield:
// <table>_<group>_<column>_idx) so a concurrent double-submit of one upload
// cannot create two posts. Postgres UNIQUE allows many NULLs, so text posts
// (no video) are unaffected.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_feed_posts_visibility" AS ENUM('community', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_feed_posts_video_storage" AS ENUM('public', 'private');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_post_reports_reason" AS ENUM('spam', 'inappropriate', 'copyright', 'other');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_video_uploads_visibility" AS ENUM('community', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "visibility" "enum_feed_posts_visibility" DEFAULT 'community' NOT NULL,
      ADD COLUMN IF NOT EXISTS "video_key" varchar,
      ADD COLUMN IF NOT EXISTS "video_thumbnail_key" varchar,
      ADD COLUMN IF NOT EXISTS "video_storage" "enum_feed_posts_video_storage",
      ADD COLUMN IF NOT EXISTS "video_duration_seconds" numeric,
      ADD COLUMN IF NOT EXISTS "video_width" numeric,
      ADD COLUMN IF NOT EXISTS "video_height" numeric,
      ADD COLUMN IF NOT EXISTS "video_bytes" numeric,
      ADD COLUMN IF NOT EXISTS "hidden_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "report_count" numeric DEFAULT 0;
    CREATE INDEX IF NOT EXISTS "feed_posts_visibility_idx" ON "feed_posts"("visibility");
    CREATE INDEX IF NOT EXISTS "feed_posts_hidden_at_idx" ON "feed_posts"("hidden_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "feed_posts_video_video_key_idx" ON "feed_posts"("video_key");

    CREATE TABLE IF NOT EXISTS "post_reports" (
      "id" serial PRIMARY KEY,
      "post_id" integer NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
      "reporter_id" varchar NOT NULL,
      "reason" "enum_post_reports_reason" NOT NULL,
      "note" varchar,
      "dismissed_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "post_reports_post_reporter_idx"
      ON "post_reports"("post_id", "reporter_id");
    CREATE INDEX IF NOT EXISTS "post_reports_post_idx" ON "post_reports"("post_id");
    CREATE INDEX IF NOT EXISTS "post_reports_reporter_id_idx" ON "post_reports"("reporter_id");
    CREATE INDEX IF NOT EXISTS "post_reports_dismissed_at_idx" ON "post_reports"("dismissed_at");
    CREATE INDEX IF NOT EXISTS "post_reports_created_at_idx" ON "post_reports"("created_at");

    CREATE TABLE IF NOT EXISTS "video_uploads" (
      "id" serial PRIMARY KEY,
      "upload_id" varchar NOT NULL,
      "user_id" varchar NOT NULL,
      "community_id" varchar NOT NULL,
      "visibility" "enum_video_uploads_visibility" NOT NULL,
      "finished_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "video_uploads_upload_id_idx" ON "video_uploads"("upload_id");
    CREATE INDEX IF NOT EXISTS "video_uploads_user_id_idx" ON "video_uploads"("user_id");
    CREATE INDEX IF NOT EXISTS "video_uploads_community_id_idx" ON "video_uploads"("community_id");
    CREATE INDEX IF NOT EXISTS "video_uploads_finished_at_idx" ON "video_uploads"("finished_at");
    CREATE INDEX IF NOT EXISTS "video_uploads_created_at_idx" ON "video_uploads"("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "post_reports_id" integer REFERENCES "post_reports"("id") ON DELETE cascade,
      ADD COLUMN IF NOT EXISTS "video_uploads_id" integer REFERENCES "video_uploads"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_post_reports_id_idx"
      ON "payload_locked_documents_rels"("post_reports_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_video_uploads_id_idx"
      ON "payload_locked_documents_rels"("video_uploads_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "post_reports_id",
      DROP COLUMN IF EXISTS "video_uploads_id";
    DROP TABLE IF EXISTS "post_reports";
    DROP TABLE IF EXISTS "video_uploads";
    DROP INDEX IF EXISTS "feed_posts_video_video_key_idx";
    ALTER TABLE "feed_posts"
      DROP COLUMN IF EXISTS "visibility",
      DROP COLUMN IF EXISTS "video_key",
      DROP COLUMN IF EXISTS "video_thumbnail_key",
      DROP COLUMN IF EXISTS "video_storage",
      DROP COLUMN IF EXISTS "video_duration_seconds",
      DROP COLUMN IF EXISTS "video_width",
      DROP COLUMN IF EXISTS "video_height",
      DROP COLUMN IF EXISTS "video_bytes",
      DROP COLUMN IF EXISTS "hidden_at",
      DROP COLUMN IF EXISTS "report_count";
    DROP TYPE IF EXISTS "public"."enum_feed_posts_visibility";
    DROP TYPE IF EXISTS "public"."enum_feed_posts_video_storage";
    DROP TYPE IF EXISTS "public"."enum_post_reports_reason";
    DROP TYPE IF EXISTS "public"."enum_video_uploads_visibility";
  `);
}
