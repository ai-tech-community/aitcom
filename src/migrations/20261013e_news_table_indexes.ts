// Indexes for /news filter, sort, and search. DDL only.
// Building these indexes reads the news tables; it does not rewrite or
// backfill rows. The tables stay small enough for that to finish inside
// the 120s deploy limit.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    CREATE INDEX IF NOT EXISTS "news_item_date_sort_idx"
      ON "app"."news_item" ("published_at" DESC NULLS LAST, "title" ASC, "id" ASC);
    CREATE INDEX IF NOT EXISTS "news_item_title_sort_idx"
      ON "app"."news_item" ("title" ASC, "id" ASC);
    CREATE INDEX IF NOT EXISTS "news_item_author_norm_idx"
      ON "app"."news_item" ((left(regexp_replace(btrim(coalesce("author", '')), '\\s+', ' ', 'g'), 160)));
    CREATE INDEX IF NOT EXISTS "news_item_title_lower_trgm"
      ON "app"."news_item" USING gin ((lower("title")) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "news_item_summary_lower_trgm"
      ON "app"."news_item" USING gin ((lower("summary")) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "news_item_ai_summary_lower_trgm"
      ON "app"."news_item" USING gin ((lower(coalesce("ai_summary", ''))) gin_trgm_ops);

    CREATE INDEX IF NOT EXISTS "news_rumor_visible_date_sort_idx"
      ON "app"."news_rumor" ("created_at" DESC NULLS LAST, "title" ASC, "id" ASC)
      WHERE "hidden_at" IS NULL;
    CREATE INDEX IF NOT EXISTS "news_rumor_title_sort_idx"
      ON "app"."news_rumor" ("title" ASC, "id" ASC);
    CREATE INDEX IF NOT EXISTS "news_rumor_submitter_norm_idx"
      ON "app"."news_rumor" ((left(regexp_replace(btrim("submitter_name"), '\\s+', ' ', 'g'), 160)));
    CREATE INDEX IF NOT EXISTS "news_rumor_title_lower_trgm"
      ON "app"."news_rumor" USING gin ((lower("title")) gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS "news_rumor_body_lower_trgm"
      ON "app"."news_rumor" USING gin ((lower("body")) gin_trgm_ops);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."news_rumor_body_lower_trgm";
    DROP INDEX IF EXISTS "app"."news_rumor_title_lower_trgm";
    DROP INDEX IF EXISTS "app"."news_rumor_submitter_norm_idx";
    DROP INDEX IF EXISTS "app"."news_rumor_title_sort_idx";
    DROP INDEX IF EXISTS "app"."news_rumor_visible_date_sort_idx";
    DROP INDEX IF EXISTS "app"."news_item_ai_summary_lower_trgm";
    DROP INDEX IF EXISTS "app"."news_item_summary_lower_trgm";
    DROP INDEX IF EXISTS "app"."news_item_title_lower_trgm";
    DROP INDEX IF EXISTS "app"."news_item_author_norm_idx";
    DROP INDEX IF EXISTS "app"."news_item_title_sort_idx";
    DROP INDEX IF EXISTS "app"."news_item_date_sort_idx";
  `);
}
