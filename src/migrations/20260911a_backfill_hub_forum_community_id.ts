import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Pre-multitenancy Hub threads (Welcome / This week / agent-finish and the
 * rest of the old `/community` board) were created with `community_id` NULL.
 * `/communities/ait/forum` filters by the Hub row id, so those live rows
 * disappeared from the Hub forum and 301s from `/community/{slug}` soft-404'd.
 *
 * Attach unscoped threads and replies to the Hub (`ait`) without touching
 * tenant-scoped rows that already have a community_id.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "forum_threads"
    SET "community_id" = (
      SELECT "id" FROM "app"."community"
      WHERE "slug" = 'ait' AND "deleted_at" IS NULL
      LIMIT 1
    )
    WHERE "community_id" IS NULL
      AND EXISTS (
        SELECT 1 FROM "app"."community"
        WHERE "slug" = 'ait' AND "deleted_at" IS NULL
      );

    UPDATE "forum_replies"
    SET "community_id" = (
      SELECT "id" FROM "app"."community"
      WHERE "slug" = 'ait' AND "deleted_at" IS NULL
      LIMIT 1
    )
    WHERE "community_id" IS NULL
      AND EXISTS (
        SELECT 1 FROM "app"."community"
        WHERE "slug" = 'ait' AND "deleted_at" IS NULL
      );
  `);
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // Safe no-op: cannot distinguish backfilled Hub rows from threads created
  // on `/communities/ait/forum` after multi-tenancy (both store the Hub id).
}
