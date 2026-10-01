// A feed post can carry a GIF from GIPHY (#391, slice 2): its GIPHY id and
// the GIPHY media addresses the server looked up for it. Additive; no
// backfill (no post has a GIF yet).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "gif_giphy_id" varchar,
      ADD COLUMN IF NOT EXISTS "gif_title" varchar,
      ADD COLUMN IF NOT EXISTS "gif_mp4_url" varchar,
      ADD COLUMN IF NOT EXISTS "gif_still_url" varchar,
      ADD COLUMN IF NOT EXISTS "gif_width" numeric,
      ADD COLUMN IF NOT EXISTS "gif_height" numeric;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts"
      DROP COLUMN IF EXISTS "gif_giphy_id",
      DROP COLUMN IF EXISTS "gif_title",
      DROP COLUMN IF EXISTS "gif_mp4_url",
      DROP COLUMN IF EXISTS "gif_still_url",
      DROP COLUMN IF EXISTS "gif_width",
      DROP COLUMN IF EXISTS "gif_height";
  `);
}
