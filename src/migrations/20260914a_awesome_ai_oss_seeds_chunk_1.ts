// Additive approved curated seeds for Awesome AI OSS chunk 1/6 (+50).
// Does not change hub≠registry, vote visibility, or the Phase 2 schema.
// Idempotent: ON CONFLICT (repo_url) DO NOTHING.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { AWESOME_AI_OSS_SEEDS_CHUNK_1 } from "@/lib/investigations/awesome-ai-oss-seeds-chunk-1";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const seed of AWESOME_AI_OSS_SEEDS_CHUNK_1) {
    const createdAt = `${seed.addedOn}T12:00:00Z`;
    await db.execute(sql`
      INSERT INTO "app"."awesome_ai_oss_project" (
        "id", "name", "repo_url", "repo_host", "category",
        "blurb_en", "blurb_nl", "status", "source", "added_on", "created_at"
      ) VALUES (
        ${seed.id},
        ${seed.name},
        ${seed.href},
        'github',
        ${seed.category},
        ${seed.blurb.en},
        ${seed.blurb.nl},
        'approved',
        'curated',
        ${seed.addedOn},
        ${createdAt}
      )
      ON CONFLICT ("repo_url") DO NOTHING;
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const seed of AWESOME_AI_OSS_SEEDS_CHUNK_1) {
    await db.execute(sql`
      DELETE FROM "app"."awesome_ai_oss_project" WHERE "id" = ${seed.id};
    `);
  }
}
