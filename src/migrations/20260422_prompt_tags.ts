import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_prompt"
    ADD COLUMN IF NOT EXISTS "tags" text[] NOT NULL DEFAULT ARRAY[]::text[];
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "benchmark_prompt_tags_gin_idx"
    ON "app"."benchmark_prompt" USING GIN ("tags");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "app"."benchmark_prompt_tags_gin_idx";
  `);
  await db.execute(sql`
    ALTER TABLE "app"."benchmark_prompt" DROP COLUMN IF EXISTS "tags";
  `);
}
