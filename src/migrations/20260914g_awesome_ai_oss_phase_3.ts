// Phase 3: live GH/GL star_count + sources[] plumbing.
// Does not invent star counts for the 278 curated seeds.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { AWESOME_AI_OSS_CURATED_SOURCES } from "@/lib/investigations/awesome-ai-oss-sources";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."awesome_ai_oss_project"
      ADD COLUMN IF NOT EXISTS "star_count" integer,
      ADD COLUMN IF NOT EXISTS "stars_checked_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "sources" jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);

  for (const [id, sources] of Object.entries(AWESOME_AI_OSS_CURATED_SOURCES)) {
    const payload = JSON.stringify(sources);
    await db.execute(sql`
      UPDATE "app"."awesome_ai_oss_project"
      SET "sources" = ${payload}::jsonb
      WHERE "id" = ${id}
        AND ("sources" IS NULL OR "sources" = '[]'::jsonb);
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."awesome_ai_oss_project"
      DROP COLUMN IF EXISTS "star_count",
      DROP COLUMN IF EXISTS "stars_checked_at",
      DROP COLUMN IF EXISTS "sources";
  `);
}
