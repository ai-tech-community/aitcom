// Ops-Passed enriched batch 1: founders / exit / jobs_url on the v1 20.
// Additive UPDATE only — 20260915c already inserted the rows. No people-graph invent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

import { STARTUPS_V1_SEEDS } from "@/lib/investigations/startups-v1-seeds";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const seed of STARTUPS_V1_SEEDS) {
    const foundersJson = JSON.stringify(seed.founders);
    await db.execute(sql`
      UPDATE "app"."startup"
      SET
        "founders" = ${foundersJson}::jsonb,
        "exit_status" = ${seed.exitStatus},
        "acquirer" = ${seed.acquirer},
        "exit_on" = ${seed.exitOn},
        "jobs_url" = ${seed.jobsUrl}
      WHERE "id" = ${seed.id} OR "homepage" = ${seed.homepage};
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const seed of STARTUPS_V1_SEEDS) {
    await db.execute(sql`
      UPDATE "app"."startup"
      SET
        "founders" = '[]'::jsonb,
        "exit_status" = NULL,
        "acquirer" = NULL,
        "exit_on" = NULL,
        "jobs_url" = NULL
      WHERE "id" = ${seed.id};
    `);
  }
}
