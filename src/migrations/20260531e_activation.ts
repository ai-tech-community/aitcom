import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."community_activation_config" (
      "community_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."community"("id"),
      "require_response" boolean DEFAULT true NOT NULL,
      "require_profile_complete" boolean DEFAULT false NOT NULL,
      "window_days" integer DEFAULT 7 NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS "app"."community_onboarding_step" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "title" varchar(255) NOT NULL,
      "href" varchar(500) NOT NULL,
      "position" integer DEFAULT 0 NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "community_onboarding_step_community_pos_idx" ON "app"."community_onboarding_step" USING btree ("community_id","position");

    CREATE TABLE IF NOT EXISTS "app"."community_onboarding_progress" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "step_id" varchar(255) NOT NULL REFERENCES "app"."community_onboarding_step"("id"),
      "completed_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "community_onboarding_progress_uidx" ON "app"."community_onboarding_progress" ("community_id","user_id","step_id");
    CREATE INDEX IF NOT EXISTS "community_onboarding_progress_member_idx" ON "app"."community_onboarding_progress" USING btree ("community_id","user_id");

    ALTER TABLE "app"."activity_event" ADD COLUMN IF NOT EXISTS "recipient_id" varchar(255);
    CREATE INDEX IF NOT EXISTS "activity_events_community_recipient_idx" ON "app"."activity_event" USING btree ("community_id","recipient_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."activity_events_community_recipient_idx";
    DROP TABLE IF EXISTS "app"."community_onboarding_progress";
    DROP TABLE IF EXISTS "app"."community_onboarding_step";
    DROP TABLE IF EXISTS "app"."community_activation_config";
  `);
}
