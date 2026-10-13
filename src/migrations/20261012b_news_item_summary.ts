// AI TL;DR stored when a news row is first inserted. Idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."news_item"
      ADD COLUMN IF NOT EXISTS "ai_summary" text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."news_item" DROP COLUMN IF EXISTS "ai_summary";
  `);
}
