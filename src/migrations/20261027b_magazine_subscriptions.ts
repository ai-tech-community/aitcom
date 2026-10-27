// Community magazines, subscriptions slice (ADR-0046; plan 2026-10-27).
// Decision 1: subscriptions are site-written, membership-style data owned by
// Drizzle. Decision 6: the announcement outbox and delivery claims stay outside
// Payload, whose saves rewrite its columns from potentially stale documents.
// Idempotent because failed deploys re-run it.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Commit the new enum value separately: Postgres cannot use it in the
  // transaction that adds it (the event-type migration follows this pattern).
  await db.execute(sql`
    ALTER TYPE "public"."enum_magazine_issues_status" ADD VALUE IF NOT EXISTS 'scheduled';
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_magazine_issues_published_via" AS ENUM('button', 'schedule');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "scheduled_for" timestamp(3) with time zone;
    ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "scheduled_by" varchar;
    ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "published_via" "public"."enum_magazine_issues_published_via";
    CREATE INDEX IF NOT EXISTS "magazine_issues_scheduled_for_idx"
      ON "magazine_issues" ("scheduled_for");

    CREATE TABLE IF NOT EXISTS "app"."magazine_subscription" (
      "id" varchar(255) PRIMARY KEY,
      "magazine_id" integer NOT NULL
        REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "user_id" varchar(255)
        REFERENCES "app"."user"("id") ON DELETE cascade,
      "email" varchar(255),
      "locale" varchar(5) NOT NULL DEFAULT 'en',
      "confirm_token_hash" varchar(64),
      "confirm_sent_at" timestamptz,
      "confirm_send_count" integer NOT NULL DEFAULT 0,
      "confirmed_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "magazine_subscription_one_subscriber_check"
        CHECK (("user_id" IS NOT NULL) <> ("email" IS NOT NULL)),
      CONSTRAINT "magazine_subscription_locale_check"
        CHECK ("locale" IN ('en', 'nl'))
    );
    CREATE INDEX IF NOT EXISTS "magazine_subscription_user_idx"
      ON "app"."magazine_subscription" ("user_id");
    CREATE INDEX IF NOT EXISTS "magazine_subscription_magazine_idx"
      ON "app"."magazine_subscription" ("magazine_id");
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_subscription_magazine_user_idx"
      ON "app"."magazine_subscription" ("magazine_id", "user_id") WHERE "user_id" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_subscription_magazine_email_idx"
      ON "app"."magazine_subscription" ("magazine_id", "email") WHERE "email" IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_subscription_confirm_token_idx"
      ON "app"."magazine_subscription" ("confirm_token_hash") WHERE "confirm_token_hash" IS NOT NULL;
    CREATE INDEX IF NOT EXISTS "magazine_subscription_email_confirm_sent_idx"
      ON "app"."magazine_subscription" ("email", "confirm_sent_at") WHERE "email" IS NOT NULL;

    CREATE TABLE IF NOT EXISTS "app"."magazine_issue_announcement" (
      "issue_id" integer PRIMARY KEY
        REFERENCES "public"."magazine_issues"("id") ON DELETE cascade,
      "magazine_id" integer NOT NULL
        REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "published_at" timestamptz NOT NULL,
      "completed_at" timestamptz,
      "last_attempted_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS "magazine_issue_announcement_open_idx"
      ON "app"."magazine_issue_announcement" ("last_attempted_at", "created_at")
      WHERE "completed_at" IS NULL;

    CREATE TABLE IF NOT EXISTS "app"."magazine_issue_delivery" (
      "issue_id" integer NOT NULL
        REFERENCES "public"."magazine_issues"("id") ON DELETE cascade,
      "subscription_id" varchar(255) NOT NULL
        REFERENCES "app"."magazine_subscription"("id") ON DELETE cascade,
      "channel" varchar(10) NOT NULL,
      "delivered_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("issue_id", "subscription_id"),
      CONSTRAINT "magazine_issue_delivery_channel_check"
        CHECK ("channel" IN ('inbox', 'email'))
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."magazine_subscription_email_confirm_sent_idx";
    DROP TABLE IF EXISTS "app"."magazine_issue_delivery";
    DROP TABLE IF EXISTS "app"."magazine_issue_announcement";
    DROP TABLE IF EXISTS "app"."magazine_subscription";
    UPDATE "magazine_issues" SET "status" = 'draft' WHERE "status" = 'scheduled';
    DROP INDEX IF EXISTS "public"."magazine_issues_scheduled_for_idx";
    ALTER TABLE "magazine_issues" DROP COLUMN IF EXISTS "scheduled_for";
    ALTER TABLE "magazine_issues" DROP COLUMN IF EXISTS "scheduled_by";
    ALTER TABLE "magazine_issues" DROP COLUMN IF EXISTS "published_via";
    DROP TYPE IF EXISTS "public"."enum_magazine_issues_published_via";
  `);
  // Postgres cannot drop one enum value; the scheduled status stays available.
}
