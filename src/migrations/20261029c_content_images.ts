// Optional pictures on community content: a media id or an http(s) URL, plus alt.
// DDL only. No backfill and no row writes.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "forum_threads"
      ADD COLUMN IF NOT EXISTS "image_media_id" numeric,
      ADD COLUMN IF NOT EXISTS "image_url" varchar,
      ADD COLUMN IF NOT EXISTS "image_alt" varchar;

    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "image_media_id" numeric,
      ADD COLUMN IF NOT EXISTS "image_alt" varchar;

    ALTER TABLE "modules"
      ADD COLUMN IF NOT EXISTS "image_media_id" numeric,
      ADD COLUMN IF NOT EXISTS "image_url" varchar,
      ADD COLUMN IF NOT EXISTS "image_alt" varchar;

    ALTER TABLE "app"."community"
      ADD COLUMN IF NOT EXISTS "banner_media_id" integer,
      ADD COLUMN IF NOT EXISTS "banner_alt" text;

    ALTER TABLE "magazines"
      ADD COLUMN IF NOT EXISTS "logo_media_id" numeric,
      ADD COLUMN IF NOT EXISTS "logo_alt" varchar,
      ADD COLUMN IF NOT EXISTS "cover_media_id" numeric,
      ADD COLUMN IF NOT EXISTS "cover_image_url" varchar,
      ADD COLUMN IF NOT EXISTS "cover_alt" varchar;

    ALTER TABLE "magazine_issues"
      ADD COLUMN IF NOT EXISTS "cover_media_id" numeric,
      ADD COLUMN IF NOT EXISTS "cover_alt" varchar;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "forum_threads"
      DROP COLUMN IF EXISTS "image_media_id",
      DROP COLUMN IF EXISTS "image_url",
      DROP COLUMN IF EXISTS "image_alt";

    ALTER TABLE "feed_posts"
      DROP COLUMN IF EXISTS "image_media_id",
      DROP COLUMN IF EXISTS "image_alt";

    ALTER TABLE "modules"
      DROP COLUMN IF EXISTS "image_media_id",
      DROP COLUMN IF EXISTS "image_url",
      DROP COLUMN IF EXISTS "image_alt";

    ALTER TABLE "app"."community"
      DROP COLUMN IF EXISTS "banner_media_id",
      DROP COLUMN IF EXISTS "banner_alt";

    ALTER TABLE "magazines"
      DROP COLUMN IF EXISTS "logo_media_id",
      DROP COLUMN IF EXISTS "logo_alt",
      DROP COLUMN IF EXISTS "cover_media_id",
      DROP COLUMN IF EXISTS "cover_image_url",
      DROP COLUMN IF EXISTS "cover_alt";

    ALTER TABLE "magazine_issues"
      DROP COLUMN IF EXISTS "cover_media_id",
      DROP COLUMN IF EXISTS "cover_alt";
  `);
}
