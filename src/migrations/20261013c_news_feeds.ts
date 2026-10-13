// Addresses the news cron fetches. DDL only: the built-in list is seeded
// by the cron, and staff add more through POST /api/news/feeds.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."news_feed" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "url" text NOT NULL,
      "enabled" boolean DEFAULT true NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "news_feed_url_idx"
      ON "app"."news_feed" USING btree ("url");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."news_feed";
  `);
}
