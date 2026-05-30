import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."notification_optout" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "community_id" varchar(255),
      "category" varchar(20) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "notification_optout_user_idx"
      ON "app"."notification_optout" USING btree ("user_id");

    CREATE TABLE IF NOT EXISTS "app"."broadcast" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "community_id" varchar(255) NOT NULL REFERENCES "app"."community"("id"),
      "author_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "subject" varchar(255) NOT NULL,
      "body" text NOT NULL,
      "class" varchar(20) DEFAULT 'promotional' NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "sent_at" timestamptz
    );
    CREATE INDEX IF NOT EXISTS "broadcast_community_idx"
      ON "app"."broadcast" USING btree ("community_id");

    CREATE TABLE IF NOT EXISTS "app"."broadcast_delivery" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "broadcast_id" varchar(255) REFERENCES "app"."broadcast"("id"),
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "community_id" varchar(255),
      "class" varchar(20) NOT NULL,
      "email_sent" boolean DEFAULT false NOT NULL,
      "window_key" varchar(16) NOT NULL,
      "dedupe_key" varchar(255),
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "broadcast_delivery_user_window_idx"
      ON "app"."broadcast_delivery" USING btree ("user_id", "window_key");
    CREATE INDEX IF NOT EXISTS "broadcast_delivery_user_dedupe_idx"
      ON "app"."broadcast_delivery" USING btree ("user_id", "dedupe_key");

    CREATE TABLE IF NOT EXISTS "app"."digest_send_log" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL REFERENCES "app"."user"("id"),
      "period_key" varchar(16) NOT NULL,
      "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "digest_send_log_user_period_uidx"
      ON "app"."digest_send_log" USING btree ("user_id", "period_key");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."digest_send_log";
    DROP TABLE IF EXISTS "app"."broadcast_delivery";
    DROP TABLE IF EXISTS "app"."broadcast";
    DROP TABLE IF EXISTS "app"."notification_optout";
  `);
}
