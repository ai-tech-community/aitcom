// News sector choice. DDL only: a side table for the community's choice,
// plus a nullable sector on feeds and stories. No defaults and no row
// updates, so deploy stays inside the 120s limit. Existing communities
// and AI stories are filled by /api/cron/news-sector-defaults.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."community_news_sector" (
      "community_id" varchar(255) PRIMARY KEY
        REFERENCES "app"."community"("id") ON DELETE CASCADE,
      "sector" varchar(32)
    );
    CREATE INDEX IF NOT EXISTS "community_news_sector_sector_idx"
      ON "app"."community_news_sector" USING btree ("sector");
    ALTER TABLE "app"."news_feed"
      ADD COLUMN IF NOT EXISTS "sector" varchar(32);
    CREATE INDEX IF NOT EXISTS "news_feed_sector_idx"
      ON "app"."news_feed" USING btree ("sector");
    ALTER TABLE "app"."news_item"
      ADD COLUMN IF NOT EXISTS "sector" varchar(32);
    CREATE INDEX IF NOT EXISTS "news_item_sector_idx"
      ON "app"."news_item" USING btree ("sector");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."news_item_sector_idx";
    ALTER TABLE "app"."news_item"
      DROP COLUMN IF EXISTS "sector";
    DROP INDEX IF EXISTS "app"."news_feed_sector_idx";
    ALTER TABLE "app"."news_feed"
      DROP COLUMN IF EXISTS "sector";
    DROP INDEX IF EXISTS "app"."community_news_sector_sector_idx";
    DROP TABLE IF EXISTS "app"."community_news_sector";
  `);
}
