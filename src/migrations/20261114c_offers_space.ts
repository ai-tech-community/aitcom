import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * People tab and Offers space (spec 2026-11-14): "What your community
 * offers" becomes a builtin space owners can hide, show, reorder and rename.
 *
 * Every community without an `offers` row gets one at position 0, where the
 * hard-coded menu link sat, and its other spaces move down by one so their
 * order is unchanged. The tab is shown when the community has a published
 * offer and hidden otherwise. Shift and insert are one statement, so they
 * commit together and a re-run finds no community to change. Additive.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    WITH targets AS (
      SELECT c."id" FROM "app"."community" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "app"."space" s
        WHERE s."community_id" = c."id" AND s."slug" = 'offers'
      )
    ), shifted AS (
      UPDATE "app"."space" SET "position" = "position" + 1
      WHERE "community_id" IN (SELECT "id" FROM targets)
      RETURNING 1
    )
    INSERT INTO "app"."space"
      ("id", "community_id", "kind", "builtin_surface", "slug", "position", "archived_at")
    SELECT gen_random_uuid()::text, t."id", 'builtin', 'offers', 'offers', 0,
      CASE WHEN EXISTS (
        SELECT 1 FROM "app"."payment_offer" o
        WHERE o."community_id" = t."id" AND o."published"
      ) THEN NULL ELSE now() END
    FROM targets t;
  `);
}

/** Removes the Offers tab rows. The +1 positions stay; gaps are harmless. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."space"
    WHERE "kind" = 'builtin' AND "builtin_surface" = 'offers';
  `);
}
