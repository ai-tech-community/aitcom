// Community gallery (spec 2026-11-13), slice 3: the gallery_reports table for
// the `gallery-reports` Payload collection, its reason enum (the feed's
// reasons plus `this_is_me`; the feed's own reason enum is left alone), the
// one-report-per-reporter-per-item unique index, the indexes Payload expects,
// and the admin-lock column on payload_locked_documents_rels (every Payload
// update/delete by id reads one <collection>_id column per collection;
// without it they all fail — see 20260927a).
//
// item_id cascades on delete, so removing a gallery item removes its reports
// with it. Additive and idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_gallery_reports_reason" AS ENUM('spam', 'inappropriate', 'copyright', 'other', 'this_is_me');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "gallery_reports" (
      "id" serial PRIMARY KEY,
      "item_id" integer NOT NULL,
      "reporter_id" varchar NOT NULL,
      "reason" "enum_gallery_reports_reason" NOT NULL,
      "note" varchar,
      "dismissed_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    DO $$ BEGIN
      ALTER TABLE "gallery_reports"
        ADD CONSTRAINT "gallery_reports_item_id_gallery_items_id_fk"
        FOREIGN KEY ("item_id") REFERENCES "public"."gallery_items"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS "gallery_reports_item_reporter_idx"
      ON "gallery_reports"("item_id", "reporter_id");
    CREATE INDEX IF NOT EXISTS "gallery_reports_item_idx" ON "gallery_reports"("item_id");
    CREATE INDEX IF NOT EXISTS "gallery_reports_reporter_id_idx" ON "gallery_reports"("reporter_id");
    CREATE INDEX IF NOT EXISTS "gallery_reports_dismissed_at_idx" ON "gallery_reports"("dismissed_at");
    CREATE INDEX IF NOT EXISTS "gallery_reports_updated_at_idx" ON "gallery_reports"("updated_at");
    CREATE INDEX IF NOT EXISTS "gallery_reports_created_at_idx" ON "gallery_reports"("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "gallery_reports_id" integer REFERENCES "gallery_reports"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_gallery_reports_id_idx"
      ON "payload_locked_documents_rels"("gallery_reports_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "gallery_reports_id";
    DROP TABLE IF EXISTS "gallery_reports";
    DROP TYPE IF EXISTS "public"."enum_gallery_reports_reason";
  `);
}
