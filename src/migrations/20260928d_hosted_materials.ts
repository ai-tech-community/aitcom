// Classroom hosted files (spec 2026-09-27 §2.1, slice 2): the
// hosted_materials table for the `hosted-materials` Payload collection, its
// select enums, the indexes Payload expects, and the admin-lock column on
// payload_locked_documents_rels (every Payload update/delete by id reads one
// <collection>_id column per collection; without it they all fail — see
// 20260927a). Slice 3 adds 'video' / 'processing' and the Mux columns in its
// own migration. Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_hosted_materials_kind" AS ENUM('file');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_hosted_materials_status" AS ENUM('uploading', 'ready', 'failed');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_hosted_materials_visibility" AS ENUM('members', 'preview');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "hosted_materials" (
      "id" serial PRIMARY KEY,
      "community_id" varchar NOT NULL,
      "course" numeric NOT NULL,
      "uploader_id" varchar NOT NULL,
      "kind" "enum_hosted_materials_kind" DEFAULT 'file' NOT NULL,
      "status" "enum_hosted_materials_status" DEFAULT 'uploading' NOT NULL,
      "failure_reason" varchar,
      "title" varchar NOT NULL,
      "visibility" "enum_hosted_materials_visibility" DEFAULT 'members' NOT NULL,
      "file_name" varchar NOT NULL,
      "extension" varchar NOT NULL,
      "content_type" varchar NOT NULL,
      "bytes" numeric NOT NULL,
      "storage_key" varchar NOT NULL,
      "upload_id" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "hosted_materials_community_id_idx" ON "hosted_materials"("community_id");
    CREATE INDEX IF NOT EXISTS "hosted_materials_course_idx" ON "hosted_materials"("course");
    CREATE INDEX IF NOT EXISTS "hosted_materials_uploader_id_idx" ON "hosted_materials"("uploader_id");
    CREATE INDEX IF NOT EXISTS "hosted_materials_status_idx" ON "hosted_materials"("status");
    CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_storage_key_idx" ON "hosted_materials"("storage_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "hosted_materials_upload_id_idx" ON "hosted_materials"("upload_id");
    CREATE INDEX IF NOT EXISTS "hosted_materials_updated_at_idx" ON "hosted_materials"("updated_at");
    CREATE INDEX IF NOT EXISTS "hosted_materials_created_at_idx" ON "hosted_materials"("created_at");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "hosted_materials_id" integer REFERENCES "hosted_materials"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_hosted_materials_id_idx"
      ON "payload_locked_documents_rels"("hosted_materials_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "hosted_materials_id";
    DROP TABLE IF EXISTS "hosted_materials";
    DROP TYPE IF EXISTS "public"."enum_hosted_materials_kind";
    DROP TYPE IF EXISTS "public"."enum_hosted_materials_status";
    DROP TYPE IF EXISTS "public"."enum_hosted_materials_visibility";
  `);
}
