import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Per-cell coverage status: distinct-contributor count per
 * (prompt, model_surface) over each rolling window. Drives the coverage
 * map UI (BYOA rebuild plan Step 4) and the ≥3 surface threshold from
 * [[adr-0007-byoa-trust-model]] decision 2.
 *
 * `meets_threshold` is the simple cached boolean used by aggregators and
 * the UI; `distinct_contributors` is the actual count so the UI can say
 * "2 more needed". `legacy_unverified` rows are excluded — they have no
 * trust-grade evidence by construction (ADR-0004 decision 3).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."agg_coverage_by_cell" (
      "prompt_id" uuid NOT NULL,
      "model_surface" "app"."model_surface" NOT NULL,
      "window_days" integer NOT NULL,
      "distinct_contributors" integer NOT NULL,
      "runs_total" integer NOT NULL,
      "meets_threshold" boolean NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
      PRIMARY KEY ("prompt_id", "model_surface", "window_days")
    );

    CREATE INDEX IF NOT EXISTS "agg_coverage_by_cell_threshold_idx"
      ON "app"."agg_coverage_by_cell"("window_days", "meets_threshold");

    CREATE INDEX IF NOT EXISTS "agg_coverage_by_cell_prompt_idx"
      ON "app"."agg_coverage_by_cell"("prompt_id", "window_days");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."agg_coverage_by_cell" CASCADE;
  `);
}
