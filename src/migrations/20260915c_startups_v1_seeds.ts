// Ops-Passed Startups v1 (20/20). Idempotent: ON CONFLICT (homepage) DO NOTHING.
// Pulse overflow homepages listed on STARTUPS_V1_OVERFLOW_HOMEPAGES stay out.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { resolveStartupPinCoords } from "@/lib/investigations/startups";
import { STARTUPS_V1_SEEDS } from "@/lib/investigations/startups-v1-seeds";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const seed of STARTUPS_V1_SEEDS) {
    const createdAt = `${seed.listedOn}T12:00:00Z`;
    const coords = resolveStartupPinCoords({
      region: seed.region,
      lat: null,
      lng: null,
    });
    const sourcesJson = JSON.stringify(seed.sources);
    await db.execute(sql`
      INSERT INTO "app"."startup" (
        "id", "name", "homepage", "category", "sources",
        "region", "lat", "lng", "stage", "logo_url",
        "status", "source", "listed_on", "created_at"
      ) VALUES (
        ${seed.id},
        ${seed.name},
        ${seed.homepage},
        ${seed.category},
        ${sourcesJson}::jsonb,
        ${seed.region},
        ${coords?.lat ?? null},
        ${coords?.lng ?? null},
        ${seed.stage},
        ${seed.logoUrl},
        'approved',
        'staff',
        ${seed.listedOn},
        ${createdAt}
      )
      ON CONFLICT ("homepage") DO NOTHING;
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const seed of STARTUPS_V1_SEEDS) {
    await db.execute(sql`
      DELETE FROM "app"."startup" WHERE "id" = ${seed.id};
    `);
  }
}
