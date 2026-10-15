// Nullable is_ai flag on a collected news story. The column starts null so
// this migration does not rewrite rows. ADD COLUMN without a default is
// metadata-only on Postgres 11+ and stays inside the 120s deploy limit.
// The backfill is not part of this migration: /api/cron/news-ai classifies
// title and source excerpt in batches. Unclear rows stay null.
// Named 20261017a so it sorts after 20261016a_news_sector.
// The sector columns stay in that earlier migration.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."news_item"
      ADD COLUMN IF NOT EXISTS "is_ai" boolean;
    CREATE INDEX IF NOT EXISTS "news_item_is_ai_idx"
      ON "app"."news_item" USING btree ("is_ai");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."news_item_is_ai_idx";
    ALTER TABLE "app"."news_item"
      DROP COLUMN IF EXISTS "is_ai";
  `);
}
