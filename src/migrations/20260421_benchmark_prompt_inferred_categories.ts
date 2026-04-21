import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Add inferred_category_ids to benchmark_prompt so a prompt can surface
 * under multiple categories. The primary category_id stays as the
 * author's choice; the extractor LLM fills inferred_category_ids based
 * on what each answer actually covers.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_prompt"
      ADD COLUMN IF NOT EXISTS "inferred_category_ids" uuid[]
      NOT NULL DEFAULT ARRAY[]::uuid[];

    CREATE INDEX IF NOT EXISTS "benchmark_prompt_inferred_category_idx"
      ON "app"."benchmark_prompt" USING GIN ("inferred_category_ids");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."benchmark_prompt_inferred_category_idx";
    ALTER TABLE "app"."benchmark_prompt"
      DROP COLUMN IF EXISTS "inferred_category_ids";
  `);
}
