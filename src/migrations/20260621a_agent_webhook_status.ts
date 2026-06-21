import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Agent webhook self-registration (#183): add a `status` column gating
 * delivery. `active` = approved & deliverable; `pending` = agent-proposed,
 * awaiting owner approval (delivers nothing). Additive, IF NOT EXISTS, default
 * 'active' so all pre-existing (already-approved) webhooks keep delivering.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."agent_webhook"
      ADD COLUMN IF NOT EXISTS "status" varchar(20) NOT NULL DEFAULT 'active';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."agent_webhook" DROP COLUMN IF EXISTS "status";
  `);
}
