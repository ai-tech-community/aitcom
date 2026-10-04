// Collector presets: the preset a run was started from (spec
// 2026-10-04-collector-presets-design). Additive and nullable: runs from
// before presets, and runs started by collector id (the agent), have none.
// varchar(64) like collector_id.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."collector_run"
      ADD COLUMN IF NOT EXISTS "preset_id" varchar(64);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."collector_run" DROP COLUMN IF EXISTS "preset_id";
  `);
}
