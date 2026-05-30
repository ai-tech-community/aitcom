import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "app"."activity_event"
    SET "community_id" = "target_id"
    WHERE "community_id" IS NULL
      AND "target_type" = 'community'
      AND "action" IN ('community.joined', 'community.left', 'community.join_requested')
  `);
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // Safe no-op: cannot distinguish backfilled rows from originally-set rows
}
