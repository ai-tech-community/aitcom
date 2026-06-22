import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Community Spaces Plan 2b — per-user room read marker. Adds a nullable
 * `last_read_at` to space_membership so room unread counts are real (replacing
 * the interim unreadCount=0). Additive + idempotent; applied via `pnpm db:apply`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."space_membership" ADD COLUMN IF NOT EXISTS "last_read_at" timestamptz;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."space_membership" DROP COLUMN IF EXISTS "last_read_at";
  `);
}
