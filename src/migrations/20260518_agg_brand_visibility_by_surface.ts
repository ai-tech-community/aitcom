import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."agg_brand_visibility_by_surface" (
      "brand_id" uuid NOT NULL,
      "model_surface" "app"."model_surface" NOT NULL,
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

    CREATE INDEX IF NOT EXISTS "agg_brand_visibility_by_surface_brand_idx"
      ON "app"."agg_brand_visibility_by_surface"("brand_id", "window_days");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."agg_brand_visibility_by_surface" CASCADE;
  `);
}
