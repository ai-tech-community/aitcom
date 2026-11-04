// Editor columns for planned MW and the AI-dedicated flag. The live facility
// table already has capacity_mw_planned and ai_dedicated
// (20260427_datacenter_research). This only adds the matching columns on the
// Payload collection table. DDL only: no row writes.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "datacenter_facilities"
      ADD COLUMN IF NOT EXISTS "capacity_mw_planned" numeric;
    ALTER TABLE "datacenter_facilities"
      ADD COLUMN IF NOT EXISTS "ai_dedicated" boolean DEFAULT false;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "datacenter_facilities" DROP COLUMN IF EXISTS "ai_dedicated";
    ALTER TABLE "datacenter_facilities"
      DROP COLUMN IF EXISTS "capacity_mw_planned";
  `);
}
