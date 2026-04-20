import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Drop old correctness-quiz tables in dependency order.
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."benchmark_vote" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_answer" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_run" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_question" CASCADE;
  `);

  // Categories (self-referential tree)
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_category" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "parent_id" uuid REFERENCES "app"."benchmark_category"("id") ON DELETE SET NULL,
      "description" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "benchmark_category_parent_idx" ON "app"."benchmark_category"("parent_id");
  `);

  // Intents
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_intent" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "description" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Prompts
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_prompt" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "text" text NOT NULL,
      "category_id" uuid NOT NULL REFERENCES "app"."benchmark_category"("id"),
      "intent_id" uuid NOT NULL REFERENCES "app"."benchmark_intent"("id"),
      "locale" text NOT NULL DEFAULT 'en-US',
      "status" text NOT NULL DEFAULT 'pending',
      "submitted_by_user_id" text NOT NULL REFERENCES "public"."user"("id"),
      "approved_by_user_id" text REFERENCES "public"."user"("id"),
      "approved_at" timestamp with time zone,
      "notes" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "benchmark_prompt_dedupe_idx"
      ON "app"."benchmark_prompt" (lower("text"), "category_id", "intent_id", "locale");
    CREATE INDEX "benchmark_prompt_status_idx" ON "app"."benchmark_prompt"("status");
    CREATE INDEX "benchmark_prompt_category_idx" ON "app"."benchmark_prompt"("category_id");
  `);

  // Brands
  await db.execute(sql`
    CREATE TABLE "app"."brand" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "canonical_name" text NOT NULL,
      "slug" text NOT NULL UNIQUE,
      "aliases" text[] NOT NULL DEFAULT ARRAY[]::text[],
      "website" text,
      "category_ids" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "brand_canonical_idx" ON "app"."brand"(lower("canonical_name"));
  `);

  // Runs
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_run" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "prompt_id" uuid NOT NULL REFERENCES "app"."benchmark_prompt"("id") ON DELETE CASCADE,
      "submitted_by_user_id" text NOT NULL REFERENCES "public"."user"("id"),
      "agent_id" uuid,
      "model_provider" text NOT NULL,
      "model_id" text NOT NULL,
      "model_version" text,
      "temperature" numeric,
      "raw_answer" text NOT NULL,
      "locale" text NOT NULL DEFAULT 'en-US',
      "captured_at" timestamp with time zone NOT NULL,
      "received_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "extraction_status" text NOT NULL DEFAULT 'pending',
      "extraction_attempts" integer NOT NULL DEFAULT 0,
      "weight" numeric NOT NULL DEFAULT 1.0,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "benchmark_run_prompt_model_time_idx"
      ON "app"."benchmark_run"("prompt_id", "model_id", "captured_at");
    CREATE INDEX "benchmark_run_extraction_status_idx"
      ON "app"."benchmark_run"("extraction_status");
    CREATE UNIQUE INDEX "benchmark_run_dedupe_idx"
      ON "app"."benchmark_run" (
        "submitted_by_user_id",
        "prompt_id",
        "model_id",
        date_trunc('day', "captured_at")
      );
  `);

  // Brand mentions
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_brand_mention" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid NOT NULL REFERENCES "app"."benchmark_run"("id") ON DELETE CASCADE,
      "raw_mention" text NOT NULL,
      "brand_id" uuid REFERENCES "app"."brand"("id") ON DELETE SET NULL,
      "rank" integer,
      "sentiment" text NOT NULL,
      "context" text,
      "confidence" numeric NOT NULL DEFAULT 0.5,
      "extractor_version" text NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "benchmark_mention_brand_idx" ON "app"."benchmark_brand_mention"("brand_id");
    CREATE INDEX "benchmark_mention_run_idx" ON "app"."benchmark_brand_mention"("run_id");
  `);

  // Alias queue
  await db.execute(sql`
    CREATE TABLE "app"."brand_alias_queue" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "raw_mention" text NOT NULL,
      "suggested_brand_id" uuid REFERENCES "app"."brand"("id") ON DELETE SET NULL,
      "run_id" uuid REFERENCES "app"."benchmark_run"("id") ON DELETE SET NULL,
      "occurrence_count" integer NOT NULL DEFAULT 1,
      "status" text NOT NULL DEFAULT 'pending',
      "reviewed_by_user_id" text REFERENCES "public"."user"("id"),
      "reviewed_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "brand_alias_queue_dedupe_idx"
      ON "app"."brand_alias_queue" (lower("raw_mention"));
    CREATE INDEX "brand_alias_queue_status_idx" ON "app"."brand_alias_queue"("status");
  `);

  // Aggregate tables
  await db.execute(sql`
    CREATE TABLE "app"."agg_brand_rank_by_prompt" (
      "prompt_id" uuid NOT NULL,
      "brand_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "window_days" integer NOT NULL,
      "mention_count" integer NOT NULL,
      "weighted_score" numeric NOT NULL,
      "avg_rank" numeric,
      "sentiment_positive_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_neutral_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_negative_pct" numeric NOT NULL DEFAULT 0,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("prompt_id", "brand_id", "model_id", "window_days")
    );

    CREATE TABLE "app"."agg_brand_trends_by_day" (
      "brand_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "category_id" uuid NOT NULL,
      "date" date NOT NULL,
      "mention_pct" numeric NOT NULL,
      "run_count" integer NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("brand_id", "model_id", "category_id", "date")
    );

    CREATE TABLE "app"."agg_model_bias_matrix" (
      "prompt_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "top_brand_ids" jsonb NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("prompt_id", "model_id")
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."agg_model_bias_matrix" CASCADE;
    DROP TABLE IF EXISTS "app"."agg_brand_trends_by_day" CASCADE;
    DROP TABLE IF EXISTS "app"."agg_brand_rank_by_prompt" CASCADE;
    DROP TABLE IF EXISTS "app"."brand_alias_queue" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_brand_mention" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_run" CASCADE;
    DROP TABLE IF EXISTS "app"."brand" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_prompt" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_intent" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_category" CASCADE;
  `);
}
