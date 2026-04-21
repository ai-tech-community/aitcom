import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Precomputed hero for the benchmark dashboard: top brand per
 * (category, window, modelScope). Rebuilt hourly by the
 * benchmark-aggregate cron.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "app"."agg_top_brand_by_category" (
      "category_id" uuid NOT NULL,
      "window_days" integer NOT NULL,
      "model_scope" text NOT NULL,
      "brand_id" uuid NOT NULL,
      "brand_slug" text NOT NULL,
      "brand_canonical_name" text NOT NULL,
      "mention_count" integer NOT NULL,
      "total_answers" integer NOT NULL,
      "share_pct" numeric(5,2) NOT NULL,
      "runner_up_brand_id" uuid,
      "runner_up_canonical_name" text,
      "runner_up_share_pct" numeric(5,2),
      "models_sampled" integer NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("category_id", "window_days", "model_scope")
    );

    CREATE INDEX "agg_top_brand_window_idx"
      ON "app"."agg_top_brand_by_category" ("window_days");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."agg_top_brand_by_category" CASCADE;
  `);
}
