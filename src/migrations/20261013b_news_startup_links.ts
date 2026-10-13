// Join news rows and rumors to directory startups. DDL only.
// Creating the tables is idempotent. The backfill is not part of this
// migration: matching the directory blew the 120s deploy limit. A cron
// fills the rows in batches (see backfillNewsStartupLinks).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."news_item_startup" (
      "news_item_id" varchar(255) NOT NULL REFERENCES "app"."news_item"("id") ON DELETE CASCADE,
      "startup_id" varchar(255) NOT NULL REFERENCES "app"."startup"("id") ON DELETE CASCADE,
      PRIMARY KEY ("news_item_id", "startup_id")
    );
    CREATE INDEX IF NOT EXISTS "news_item_startup_startup_idx"
      ON "app"."news_item_startup" USING btree ("startup_id");

    CREATE TABLE IF NOT EXISTS "app"."news_rumor_startup" (
      "news_rumor_id" varchar(255) NOT NULL REFERENCES "app"."news_rumor"("id") ON DELETE CASCADE,
      "startup_id" varchar(255) NOT NULL REFERENCES "app"."startup"("id") ON DELETE CASCADE,
      PRIMARY KEY ("news_rumor_id", "startup_id")
    );
    CREATE INDEX IF NOT EXISTS "news_rumor_startup_startup_idx"
      ON "app"."news_rumor_startup" USING btree ("startup_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."news_rumor_startup";
    DROP TABLE IF EXISTS "app"."news_item_startup";
  `);
}
