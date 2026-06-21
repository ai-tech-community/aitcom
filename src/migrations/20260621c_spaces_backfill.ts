import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * Backfill default builtin spaces for communities that predate Slice 3 Plan 1.
 * For each (community × surface) pair, insert one builtin space if absent.
 * Idempotent: re-running inserts nothing. Position matches the canonical nav
 * order in src/server/communities/space-defaults.ts.
 */
const SURFACES: Array<{ surface: string; position: number }> = [
  { surface: "forum", position: 0 },
  { surface: "events", position: 1 },
  { surface: "classroom", position: 2 },
  { surface: "ideas", position: 3 },
  { surface: "members", position: 4 },
];

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const { surface, position } of SURFACES) {
    await db.execute(sql`
      INSERT INTO "app"."space"
        ("id", "community_id", "kind", "builtin_surface", "slug", "position")
      SELECT
        gen_random_uuid()::text, c."id", 'builtin', ${surface}, ${surface}, ${position}
      FROM "app"."community" c
      WHERE NOT EXISTS (
        SELECT 1 FROM "app"."space" s
        WHERE s."community_id" = c."id" AND s."builtin_surface" = ${surface}
      );
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Remove only backfilled builtin rows; leave any admin-created rows intact.
  await db.execute(
    sql`DELETE FROM "app"."space" WHERE "kind" = 'builtin';`,
  );
}
