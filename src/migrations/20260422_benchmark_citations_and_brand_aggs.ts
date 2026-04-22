import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // 1. Citations source table
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_citation" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid NOT NULL REFERENCES "app"."benchmark_run"("id") ON DELETE CASCADE,
      "url" text NOT NULL,
      "domain" text NOT NULL,
      "title" text,
      "snippet" text,
      "position" integer NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "benchmark_citation_run_url_uq" UNIQUE ("run_id", "url")
    );
    CREATE INDEX "benchmark_citation_run_idx" ON "app"."benchmark_citation"("run_id");
    CREATE INDEX "benchmark_citation_domain_idx" ON "app"."benchmark_citation"("domain");
  `);

  // 2. Extend agg_brand_rank_by_prompt with top-5 citation domains
  await db.execute(sql`
    ALTER TABLE "app"."agg_brand_rank_by_prompt"
    ADD COLUMN IF NOT EXISTS "citation_domains_top5" text[] NOT NULL DEFAULT ARRAY[]::text[];
  `);

  // 3. agg_citation_by_brand
  await db.execute(sql`
    CREATE TABLE "app"."agg_citation_by_brand" (
      "brand_id" uuid NOT NULL,
      "category_id" uuid,
      "model_id" text NOT NULL,
      "window_days" integer NOT NULL,
      "domain" text NOT NULL,
      "citation_count" integer NOT NULL,
      "last_seen_at" timestamp with time zone NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "agg_citation_by_brand_brand_idx"
      ON "app"."agg_citation_by_brand"("brand_id", "window_days");
  `);

  // 4. agg_brand_visibility_by_model (+primary_category cache)
  await db.execute(sql`
    CREATE TABLE "app"."agg_brand_visibility_by_model" (
      "brand_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "window_days" integer NOT NULL,
      "primary_category_id" uuid,
      "mentions_count" integer NOT NULL,
      "runs_total" integer NOT NULL,
      "visibility_pct" numeric NOT NULL,
      "avg_rank" numeric,
      "sentiment_pos_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_neu_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_neg_pct" numeric NOT NULL DEFAULT 0,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "agg_brand_visibility_by_model_brand_idx"
      ON "app"."agg_brand_visibility_by_model"("brand_id", "window_days");
  `);

  // 5. agg_brand_visibility_by_day (brand-pivot trend)
  await db.execute(sql`
    CREATE TABLE "app"."agg_brand_visibility_by_day" (
      "brand_id" uuid NOT NULL,
      "date" date NOT NULL,
      "model_id" text NOT NULL,
      "mentions_count" integer NOT NULL,
      "runs_total" integer NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "agg_brand_visibility_by_day_brand_idx"
      ON "app"."agg_brand_visibility_by_day"("brand_id", "date");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "app"."agg_brand_visibility_by_day";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."agg_brand_visibility_by_model";`);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."agg_citation_by_brand";`);
  await db.execute(sql`
    ALTER TABLE "app"."agg_brand_rank_by_prompt"
    DROP COLUMN IF EXISTS "citation_domains_top5";
  `);
  await db.execute(sql`DROP TABLE IF EXISTS "app"."benchmark_citation" CASCADE;`);
}
