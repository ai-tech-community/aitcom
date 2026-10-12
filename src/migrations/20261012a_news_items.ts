// Stories collected from RSS/Atom feed runs, shown on /news.
// Idempotent: creating the table twice is a no-op.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."news_item" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "url" text NOT NULL,
      "title" text NOT NULL,
      "author" text,
      "published_at" timestamp with time zone,
      "summary" text DEFAULT '' NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamp with time zone
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "news_item_url_idx"
      ON "app"."news_item" USING btree ("url");
    CREATE INDEX IF NOT EXISTS "news_item_published_idx"
      ON "app"."news_item" USING btree ("published_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."news_item";
  `);
}
