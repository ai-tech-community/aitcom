// Feed post link previews: the linkPreview group on feed_posts. Filled by
// the FeedPosts beforeChange hook from the first link in the post's content.
// All columns nullable, no default: existing posts stay null and render a
// plain link card until their link is next edited. Idempotent (ADD/DROP
// COLUMN IF EXISTS) so a re-run is a safe no-op.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "link_preview_url" varchar,
      ADD COLUMN IF NOT EXISTS "link_preview_title" varchar,
      ADD COLUMN IF NOT EXISTS "link_preview_description" varchar,
      ADD COLUMN IF NOT EXISTS "link_preview_image_url" varchar,
      ADD COLUMN IF NOT EXISTS "link_preview_site_name" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts"
      DROP COLUMN IF EXISTS "link_preview_url",
      DROP COLUMN IF EXISTS "link_preview_title",
      DROP COLUMN IF EXISTS "link_preview_description",
      DROP COLUMN IF EXISTS "link_preview_image_url",
      DROP COLUMN IF EXISTS "link_preview_site_name";
  `);
}
