import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."ritual" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "author_user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "suggested_by_agent_id" varchar(255) REFERENCES "app"."agent_profile"("id"),
      "title" varchar(255) NOT NULL,
      "body" text NOT NULL,
      "category" varchar(20) DEFAULT 'general' NOT NULL,
      "weekday" integer NOT NULL,
      "mode" varchar(10) DEFAULT 'review' NOT NULL,
      "status" varchar(10) DEFAULT 'active' NOT NULL,
      "last_fired_on" date,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "ritual_community_idx" ON "app"."ritual" USING btree ("community_id");
    CREATE INDEX IF NOT EXISTS "ritual_status_weekday_idx" ON "app"."ritual" USING btree ("status","weekday");

    CREATE TABLE IF NOT EXISTS "app"."ritual_occurrence" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "ritual_id" varchar(255) NOT NULL REFERENCES "app"."ritual"("id"),
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "scheduled_for" date NOT NULL,
      "status" varchar(10) DEFAULT 'pending' NOT NULL,
      "thread_id" integer,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "posted_at" timestamptz
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ritual_occurrence_ritual_date_uidx" ON "app"."ritual_occurrence" ("ritual_id","scheduled_for");
    CREATE INDEX IF NOT EXISTS "ritual_occurrence_community_status_idx" ON "app"."ritual_occurrence" USING btree ("community_id","status");

    CREATE TABLE IF NOT EXISTS "app"."community_engage_config" (
      "community_id" varchar(255) PRIMARY KEY NOT NULL REFERENCES "app"."community"("id"),
      "ritual_recap" boolean DEFAULT true NOT NULL,
      "ritual_reminder" boolean DEFAULT true NOT NULL,
      "at_risk_line" boolean DEFAULT false NOT NULL,
      "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."community_engage_config";
    DROP TABLE IF EXISTS "app"."ritual_occurrence";
    DROP TABLE IF EXISTS "app"."ritual";
  `);
}
