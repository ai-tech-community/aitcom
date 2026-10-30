// Community magazines, growth slice (plan 2026-10-28, Decisions 10, 11, 14, 16).
// Additive and idempotent: failed deploys may re-run this migration.
// Cross-schema Payload foreign keys live here, not in schema.ts.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Commit enum values separately: Postgres cannot use a new value in the
  // transaction that adds it (the automatic-drafts migration does the same).
  await db.execute(sql`
    ALTER TYPE "public"."enum_magazines_default_visibility" ADD VALUE IF NOT EXISTS 'teaser' BEFORE 'public';
    ALTER TYPE "public"."enum_magazine_issues_visibility" ADD VALUE IF NOT EXISTS 'teaser' BEFORE 'public';
    ALTER TYPE "public"."enum_magazine_issues_layout" ADD VALUE IF NOT EXISTS 'long-read';
    ALTER TYPE "public"."enum_magazine_issues_layout" ADD VALUE IF NOT EXISTS 'digest';
  `);
  await db.execute(sql`
    ALTER TABLE "app"."magazine_auto_draft_settings"
      DROP CONSTRAINT IF EXISTS "magazine_auto_draft_settings_layout_check",
      ADD CONSTRAINT "magazine_auto_draft_settings_layout_check"
        CHECK ("layout" IN ('cover-story', 'long-read', 'digest'));
    ALTER TABLE "app"."magazine_auto_draft_settings"
      DROP CONSTRAINT IF EXISTS "magazine_auto_draft_settings_visibility_check",
      ADD CONSTRAINT "magazine_auto_draft_settings_visibility_check"
        CHECK ("visibility" IS NULL OR "visibility" IN ('members', 'teaser', 'public'));

    ALTER TABLE "public"."magazines"
      ADD COLUMN IF NOT EXISTS "listing_hidden" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "listing_hidden_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "listing_hidden_by" varchar;

    ALTER TABLE "app"."magazine_subscription"
      ADD COLUMN IF NOT EXISTS "source_issue_id" integer
        REFERENCES "public"."magazine_issues"("id") ON DELETE set null;
    CREATE INDEX IF NOT EXISTS "magazine_subscription_source_issue_idx"
      ON "app"."magazine_subscription" ("source_issue_id");

    CREATE TABLE IF NOT EXISTS "app"."magazine_read" (
      "id" varchar(255) PRIMARY KEY,
      "magazine_id" integer NOT NULL REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "issue_id" integer NOT NULL REFERENCES "public"."magazine_issues"("id") ON DELETE cascade,
      "article_id" integer REFERENCES "public"."articles"("id") ON DELETE cascade,
      "reader_key" varchar(64) NOT NULL,
      "views" integer NOT NULL DEFAULT 0,
      "read_to_end_at" timestamptz,
      "first_seen_at" timestamptz NOT NULL,
      "last_seen_at" timestamptz NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_read_issue_reader_idx"
      ON "app"."magazine_read" ("issue_id", "reader_key") WHERE "article_id" IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_read_article_reader_idx"
      ON "app"."magazine_read" ("issue_id", "article_id", "reader_key") WHERE "article_id" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "magazine_read_magazine_idx"
      ON "app"."magazine_read" ("magazine_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."magazine_read";
    ALTER TABLE "app"."magazine_subscription" DROP COLUMN IF EXISTS "source_issue_id";
    ALTER TABLE "public"."magazines"
      DROP COLUMN IF EXISTS "listing_hidden",
      DROP COLUMN IF EXISTS "listing_hidden_at",
      DROP COLUMN IF EXISTS "listing_hidden_by";
  `);
  // Postgres cannot drop enum values; narrowing a check could reject rows
  // that use them. Enum values and the widened checks stay.
}
