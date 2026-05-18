import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TYPE "app"."model_surface" AS ENUM (
      'chatgpt_grounded',
      'chatgpt_ungrounded',
      'claude_grounded',
      'claude_ungrounded',
      'gemini_grounded',
      'gemini_ungrounded',
      'perplexity',
      'kimi_grounded',
      'legacy_unverified'
    );
  `);

  await db.execute(sql`
    CREATE TYPE "app"."proxy_status" AS ENUM (
      'queued',
      'running',
      'done',
      'failed'
    );
  `);

  await db.execute(sql`
    ALTER TABLE "app"."benchmark_run"
      ADD COLUMN IF NOT EXISTS "model_surface"
        "app"."model_surface" NOT NULL DEFAULT 'legacy_unverified',
      ADD COLUMN IF NOT EXISTS "proxy_status"
        "app"."proxy_status" NOT NULL DEFAULT 'done',
      ADD COLUMN IF NOT EXISTS "proxy_response_raw" jsonb,
      ADD COLUMN IF NOT EXISTS "cost_cents" integer,
      ADD COLUMN IF NOT EXISTS "provider_response_id" text;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "benchmark_run_surface_captured_idx"
      ON "app"."benchmark_run" ("model_surface", "captured_at");

    CREATE INDEX IF NOT EXISTS "benchmark_run_proxy_status_idx"
      ON "app"."benchmark_run" ("proxy_status")
      WHERE "proxy_status" IN ('queued', 'running');
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."benchmark_run_source" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid NOT NULL
        REFERENCES "app"."benchmark_run"("id") ON DELETE CASCADE,
      "url" text NOT NULL,
      "domain" text NOT NULL,
      "title" text,
      "snippet" text,
      "position" integer,
      "kind" text NOT NULL,
      "source_type" text NOT NULL DEFAULT 'unknown',
      "brand_relation" text NOT NULL DEFAULT 'unknown',
      "explicit_citation" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS "benchmark_run_source_run_idx"
      ON "app"."benchmark_run_source" ("run_id");

    CREATE INDEX IF NOT EXISTS "benchmark_run_source_domain_idx"
      ON "app"."benchmark_run_source" ("domain");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."benchmark_run_source" CASCADE;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."benchmark_run_proxy_status_idx";
    DROP INDEX IF EXISTS "app"."benchmark_run_surface_captured_idx";

    ALTER TABLE "app"."benchmark_run"
      DROP COLUMN IF EXISTS "provider_response_id",
      DROP COLUMN IF EXISTS "cost_cents",
      DROP COLUMN IF EXISTS "proxy_response_raw",
      DROP COLUMN IF EXISTS "proxy_status",
      DROP COLUMN IF EXISTS "model_surface";
  `);

  await db.execute(sql`
    DROP TYPE IF EXISTS "app"."proxy_status";
    DROP TYPE IF EXISTS "app"."model_surface";
  `);
}
