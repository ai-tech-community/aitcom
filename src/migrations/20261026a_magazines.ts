// Community magazines, core slice (spec 2026-10-26, ADR-0042/0043). DDL
// transcribed from a Payload push of the config into a scratch database, so
// every table, index and constraint has the name Payload expects:
// - `magazines` (one per community: unique index on community_id) and its
//   `magazines_topics` array table.
// - `magazine_issues`, its `_locales` table (localized title and editor's
//   note), and one table per `items` block kind (ADR-0043): `article` holds
//   the article reference, `editorial` its localized heading/body in
//   `_blocks_editorial_locales`. Compound unique indexes keep issue slugs and
//   numbers unique per magazine.
// - `articles.magazine_id` / `magazine_issue_id` and the matching
//   `_articles_v.version_*` columns (Articles has drafts, so every field also
//   lives on the version table; without them every article query fails).
// - The admin-lock columns on payload_locked_documents_rels (every Payload
//   update/delete by id reads one <collection>_id column per collection;
//   without them they all fail — see 20260927a).
// Idempotent: a failed deploy re-runs it.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_magazines_default_visibility" AS ENUM('members', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_magazine_issues_layout" AS ENUM('cover-story');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_magazine_issues_visibility" AS ENUM('members', 'public');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      CREATE TYPE "public"."enum_magazine_issues_status" AS ENUM('draft', 'published');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "magazines" (
      "id" serial PRIMARY KEY,
      "name" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "community_id" varchar NOT NULL,
      "description" varchar,
      "logo_url" varchar,
      "default_visibility" "enum_magazines_default_visibility" DEFAULT 'members',
      "public_confirmed_by" varchar,
      "public_confirmed_at" timestamp(3) with time zone,
      "created_by" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "magazines_slug_idx" ON "magazines"("slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "magazines_community_id_idx" ON "magazines"("community_id");
    CREATE INDEX IF NOT EXISTS "magazines_updated_at_idx" ON "magazines"("updated_at");
    CREATE INDEX IF NOT EXISTS "magazines_created_at_idx" ON "magazines"("created_at");

    CREATE TABLE IF NOT EXISTS "magazines_topics" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "topic" varchar
    );
    CREATE INDEX IF NOT EXISTS "magazines_topics_order_idx" ON "magazines_topics"("_order");
    CREATE INDEX IF NOT EXISTS "magazines_topics_parent_id_idx" ON "magazines_topics"("_parent_id");
    DO $$ BEGIN
      ALTER TABLE "magazines_topics"
        ADD CONSTRAINT "magazines_topics_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazines"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "magazine_issues" (
      "id" serial PRIMARY KEY,
      "magazine_id" integer NOT NULL,
      "community_id" varchar NOT NULL,
      "number" numeric NOT NULL,
      "slug" varchar NOT NULL,
      "cover_image_url" varchar,
      "layout" "enum_magazine_issues_layout" DEFAULT 'cover-story',
      "visibility" "enum_magazine_issues_visibility" DEFAULT 'members' NOT NULL,
      "public_confirmed_by" varchar,
      "public_confirmed_at" timestamp(3) with time zone,
      "status" "enum_magazine_issues_status" DEFAULT 'draft' NOT NULL,
      "published_at" timestamp(3) with time zone,
      "published_by" varchar,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
    DO $$ BEGIN
      ALTER TABLE "magazine_issues"
        ADD CONSTRAINT "magazine_issues_magazine_id_magazines_id_fk"
        FOREIGN KEY ("magazine_id") REFERENCES "public"."magazines"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "magazine_issues_magazine_idx" ON "magazine_issues"("magazine_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_community_id_idx" ON "magazine_issues"("community_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_visibility_idx" ON "magazine_issues"("visibility");
    CREATE INDEX IF NOT EXISTS "magazine_issues_status_idx" ON "magazine_issues"("status");
    CREATE INDEX IF NOT EXISTS "magazine_issues_published_at_idx" ON "magazine_issues"("published_at");
    CREATE INDEX IF NOT EXISTS "magazine_issues_updated_at_idx" ON "magazine_issues"("updated_at");
    CREATE INDEX IF NOT EXISTS "magazine_issues_created_at_idx" ON "magazine_issues"("created_at");
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_slug_idx" ON "magazine_issues"("magazine_id", "slug");
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_number_idx" ON "magazine_issues"("magazine_id", "number");

    CREATE TABLE IF NOT EXISTS "magazine_issues_locales" (
      "title" varchar NOT NULL,
      "editor_note" jsonb,
      "id" serial PRIMARY KEY,
      "_locale" "_locales" NOT NULL,
      "_parent_id" integer NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_issues_locales_locale_parent_id_unique"
      ON "magazine_issues_locales"("_locale", "_parent_id");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_locales"
        ADD CONSTRAINT "magazine_issues_locales_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_article" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "intro" varchar,
      "article_id" integer NOT NULL,
      "block_name" varchar
    );
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_article_order_idx" ON "magazine_issues_blocks_article"("_order");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_article_parent_id_idx" ON "magazine_issues_blocks_article"("_parent_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_article_path_idx" ON "magazine_issues_blocks_article"("_path");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_article_article_idx" ON "magazine_issues_blocks_article"("article_id");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_article"
        ADD CONSTRAINT "magazine_issues_blocks_article_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_article"
        ADD CONSTRAINT "magazine_issues_blocks_article_article_id_articles_id_fk"
        FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_editorial" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "intro" varchar,
      "block_name" varchar
    );
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_editorial_order_idx" ON "magazine_issues_blocks_editorial"("_order");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_editorial_parent_id_idx" ON "magazine_issues_blocks_editorial"("_parent_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_editorial_path_idx" ON "magazine_issues_blocks_editorial"("_path");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_editorial"
        ADD CONSTRAINT "magazine_issues_blocks_editorial_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_editorial_locales" (
      "heading" varchar,
      "body" jsonb NOT NULL,
      "id" serial PRIMARY KEY,
      "_locale" "_locales" NOT NULL,
      "_parent_id" varchar NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_issues_blocks_editorial_locales_locale_parent_id_un"
      ON "magazine_issues_blocks_editorial_locales"("_locale", "_parent_id");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_editorial_locales"
        ADD CONSTRAINT "magazine_issues_blocks_editorial_locales_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues_blocks_editorial"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "magazine_id" integer;
    ALTER TABLE "articles" ADD COLUMN IF NOT EXISTS "magazine_issue_id" integer;
    DO $$ BEGIN
      ALTER TABLE "articles"
        ADD CONSTRAINT "articles_magazine_id_magazines_id_fk"
        FOREIGN KEY ("magazine_id") REFERENCES "public"."magazines"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "articles"
        ADD CONSTRAINT "articles_magazine_issue_id_magazine_issues_id_fk"
        FOREIGN KEY ("magazine_issue_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "articles_magazine_idx" ON "articles"("magazine_id");
    CREATE INDEX IF NOT EXISTS "articles_magazine_issue_idx" ON "articles"("magazine_issue_id");

    ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_magazine_id" integer;
    ALTER TABLE "_articles_v" ADD COLUMN IF NOT EXISTS "version_magazine_issue_id" integer;
    DO $$ BEGIN
      ALTER TABLE "_articles_v"
        ADD CONSTRAINT "_articles_v_version_magazine_id_magazines_id_fk"
        FOREIGN KEY ("version_magazine_id") REFERENCES "public"."magazines"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    DO $$ BEGIN
      ALTER TABLE "_articles_v"
        ADD CONSTRAINT "_articles_v_version_magazine_issue_id_magazine_issues_id_fk"
        FOREIGN KEY ("version_magazine_issue_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "_articles_v_version_version_magazine_idx" ON "_articles_v"("version_magazine_id");
    CREATE INDEX IF NOT EXISTS "_articles_v_version_version_magazine_issue_idx" ON "_articles_v"("version_magazine_issue_id");

    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "magazines_id" integer REFERENCES "magazines"("id") ON DELETE cascade;
    ALTER TABLE "payload_locked_documents_rels"
      ADD COLUMN IF NOT EXISTS "magazine_issues_id" integer REFERENCES "magazine_issues"("id") ON DELETE cascade;
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_magazines_id_idx"
      ON "payload_locked_documents_rels"("magazines_id");
    CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_magazine_issues_id_idx"
      ON "payload_locked_documents_rels"("magazine_issues_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "magazine_issues_id";
    ALTER TABLE "payload_locked_documents_rels"
      DROP COLUMN IF EXISTS "magazines_id";
    ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_magazine_issue_id";
    ALTER TABLE "_articles_v" DROP COLUMN IF EXISTS "version_magazine_id";
    ALTER TABLE "articles" DROP COLUMN IF EXISTS "magazine_issue_id";
    ALTER TABLE "articles" DROP COLUMN IF EXISTS "magazine_id";
    DROP TABLE IF EXISTS "magazine_issues_blocks_editorial_locales";
    DROP TABLE IF EXISTS "magazine_issues_blocks_editorial";
    DROP TABLE IF EXISTS "magazine_issues_blocks_article";
    DROP TABLE IF EXISTS "magazine_issues_locales";
    DROP TABLE IF EXISTS "magazine_issues";
    DROP TABLE IF EXISTS "magazines_topics";
    DROP TABLE IF EXISTS "magazines";
    DROP TYPE IF EXISTS "public"."enum_magazine_issues_status";
    DROP TYPE IF EXISTS "public"."enum_magazine_issues_visibility";
    DROP TYPE IF EXISTS "public"."enum_magazine_issues_layout";
    DROP TYPE IF EXISTS "public"."enum_magazines_default_visibility";
  `);
}
