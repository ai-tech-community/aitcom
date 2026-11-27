import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Find a match space (spec 2026-11-26): matching moves into its own builtin
 * space, slug `match`. New communities get it when an owner saves their first
 * connection type; this backfills the communities that already have an
 * active one. A community whose types are all archived has matching off, so
 * it gets no row: the menu never opens an empty matching page.
 *
 * The row goes at the end of the menu (the community's highest position + 1,
 * or 0) and is shown, with no custom name. A community whose slug `match` is
 * already taken (a room, an owner's save, or an earlier run) is skipped, so a
 * re-run is a no-op and an owner's hide, rename or reorder is never touched.
 * One statement; additive only.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    INSERT INTO "app"."space"
      ("id", "community_id", "kind", "builtin_surface", "name", "slug", "position", "archived_at")
    SELECT gen_random_uuid()::text, c."id", 'builtin', 'matching', NULL, 'match',
      COALESCE((
        SELECT MAX(s."position") FROM "app"."space" s WHERE s."community_id" = c."id"
      ), -1) + 1,
      NULL
    FROM "app"."community" c
    WHERE EXISTS (
      SELECT 1 FROM "app"."community_connection_type" t
      WHERE t."community_id" = c."id" AND t."active"
    )
    AND NOT EXISTS (
      SELECT 1 FROM "app"."space" s WHERE s."community_id" = c."id" AND s."slug" = 'match'
    )
    ON CONFLICT ("community_id", "slug") DO NOTHING;
  `);
}

/** Removes the Find a match rows. Rooms that use the slug `match` stay. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."space"
    WHERE "kind" = 'builtin' AND "builtin_surface" = 'matching';
  `);
}
