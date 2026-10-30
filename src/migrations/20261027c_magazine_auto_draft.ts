// Community magazines, automatic drafts (ADR-0047; plan 2026-10-27).
// Decisions 3, 4, 6, 10: editor-only picks, settings, period claims and history
// stay in Drizzle, outside Payload saves. Idempotent because failed deploys
// re-run it. Cross-schema Payload foreign keys live here, not in schema.ts.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Commit the new enum value separately: Postgres cannot use it in the
  // transaction that adds it (the subscriptions migration follows this pattern).
  await db.execute(sql`
    ALTER TYPE "public"."enum_magazine_issues_published_via" ADD VALUE IF NOT EXISTS 'auto';
  `);
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_magazine_issues_scheduled_via" AS ENUM('schedule', 'auto');
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    ALTER TABLE "magazine_issues" ADD COLUMN IF NOT EXISTS "scheduled_via" "public"."enum_magazine_issues_scheduled_via";

    CREATE TABLE IF NOT EXISTS "app"."magazine_auto_draft_settings" (
      "magazine_id" integer PRIMARY KEY
        REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "enabled" boolean NOT NULL DEFAULT false,
      "cadence" varchar(16) NOT NULL DEFAULT 'monthly',
      "month_day" smallint NOT NULL DEFAULT 1,
      "weekday" smallint NOT NULL DEFAULT 1,
      "look_back" varchar(20) NOT NULL DEFAULT 'since_last_issue',
      "layout" varchar(32) NOT NULL DEFAULT 'cover-story',
      "visibility" varchar(16),
      "public_confirmed_by" varchar(255),
      "public_confirmed_at" timestamptz,
      "sources" jsonb NOT NULL DEFAULT '{}'::jsonb,
      "never_reuse" boolean NOT NULL DEFAULT true,
      "when_ready" varchar(16) NOT NULL DEFAULT 'notify',
      "auto_publish_days" smallint NOT NULL DEFAULT 3,
      "schedule_starts_at" timestamptz,
      "updated_by" varchar(255) REFERENCES "app"."user"("id") ON DELETE set null,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "magazine_auto_draft_settings_cadence_check"
        CHECK ("cadence" IN ('monthly', 'biweekly', 'weekly', 'after_event', 'on_demand')),
      CONSTRAINT "magazine_auto_draft_settings_month_day_check" CHECK ("month_day" BETWEEN 1 AND 28),
      CONSTRAINT "magazine_auto_draft_settings_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
      CONSTRAINT "magazine_auto_draft_settings_look_back_check"
        CHECK ("look_back" IN ('since_last_issue', 'days_30', 'days_7')),
      CONSTRAINT "magazine_auto_draft_settings_layout_check" CHECK ("layout" IN ('cover-story')),
      CONSTRAINT "magazine_auto_draft_settings_visibility_check"
        CHECK ("visibility" IS NULL OR "visibility" IN ('members', 'public')),
      CONSTRAINT "magazine_auto_draft_settings_when_ready_check"
        CHECK ("when_ready" IN ('notify', 'auto_publish')),
      CONSTRAINT "magazine_auto_draft_settings_publish_days_check" CHECK ("auto_publish_days" BETWEEN 1 AND 14)
    );

    CREATE TABLE IF NOT EXISTS "app"."magazine_auto_draft_run" (
      "id" varchar(255) PRIMARY KEY,
      "magazine_id" integer NOT NULL REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "period_key" varchar(80) NOT NULL,
      "trigger" varchar(16) NOT NULL,
      "status" varchar(16) NOT NULL,
      "skip_reason" varchar(32),
      "found_count" integer,
      "issue_id" integer REFERENCES "public"."magazine_issues"("id") ON DELETE set null,
      "requested_by" varchar(255) REFERENCES "app"."user"("id") ON DELETE set null,
      "attempts" smallint NOT NULL DEFAULT 1,
      "claimed_at" timestamptz NOT NULL,
      "finished_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "magazine_auto_draft_run_trigger_check" CHECK ("trigger" IN ('schedule', 'event', 'manual')),
      CONSTRAINT "magazine_auto_draft_run_status_check" CHECK ("status" IN ('running', 'made', 'skipped', 'failed')),
      CONSTRAINT "magazine_auto_draft_run_skip_reason_check"
        CHECK ("skip_reason" IS NULL OR "skip_reason" IN ('too_few', 'draft_open', 'no_rights'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_auto_draft_run_period_idx"
      ON "app"."magazine_auto_draft_run" ("magazine_id", "period_key");
    CREATE UNIQUE INDEX IF NOT EXISTS "magazine_auto_draft_run_running_idx"
      ON "app"."magazine_auto_draft_run" ("magazine_id") WHERE "status" = 'running';
    CREATE INDEX IF NOT EXISTS "magazine_auto_draft_run_issue_idx"
      ON "app"."magazine_auto_draft_run" ("issue_id");

    CREATE TABLE IF NOT EXISTS "app"."magazine_auto_pick" (
      "issue_id" integer NOT NULL REFERENCES "public"."magazine_issues"("id") ON DELETE cascade,
      "item_id" varchar(255) NOT NULL,
      "reason" jsonb NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("issue_id", "item_id")
    );

    CREATE TABLE IF NOT EXISTS "app"."magazine_issue_history" (
      "id" bigserial PRIMARY KEY,
      "magazine_id" integer NOT NULL REFERENCES "public"."magazines"("id") ON DELETE cascade,
      "issue_id" integer REFERENCES "public"."magazine_issues"("id") ON DELETE set null,
      "issue_number" integer,
      "issue_title" text,
      "event" varchar(32) NOT NULL,
      "origin" varchar(16),
      "actor_id" varchar(255) REFERENCES "app"."user"("id") ON DELETE set null,
      "detail" jsonb NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "magazine_issue_history_event_check"
        CHECK ("event" IN ('draft_made', 'draft_skipped', 'items_changed', 'auto_publish_stopped', 'published', 'deleted')),
      CONSTRAINT "magazine_issue_history_origin_check"
        CHECK ("origin" IS NULL OR "origin" IN ('button', 'schedule', 'auto'))
    );
    CREATE INDEX IF NOT EXISTS "magazine_issue_history_magazine_idx"
      ON "app"."magazine_issue_history" ("magazine_id", "created_at");
    CREATE INDEX IF NOT EXISTS "magazine_issue_history_issue_idx"
      ON "app"."magazine_issue_history" ("issue_id", "created_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."magazine_issue_history";
    DROP TABLE IF EXISTS "app"."magazine_auto_pick";
    DROP TABLE IF EXISTS "app"."magazine_auto_draft_run";
    DROP TABLE IF EXISTS "app"."magazine_auto_draft_settings";
    ALTER TABLE "magazine_issues" DROP COLUMN IF EXISTS "scheduled_via";
    DROP TYPE IF EXISTS "public"."enum_magazine_issues_scheduled_via";
  `);
  // Postgres cannot drop an enum value; 'auto' stays available and rows are untouched.
}
