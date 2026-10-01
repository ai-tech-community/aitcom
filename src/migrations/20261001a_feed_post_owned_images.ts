// Feed post images become owned uploads (#388): a media file records who
// uploaded it and what for, and a post links its picture by id (one post
// per image) instead of trusting a URL. `image_url` stays as the server-
// written copy of the image's public URL.
//
// Backfill: a post whose `image_url` points at a picture the feed composer
// uploaded (matched by file name and the composer's alt text), that no other
// post shows and nothing else links, is linked to it, and that upload
// becomes the post author's feed post image. Every other URL is left as it
// is (shown as before, never deleted).
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "public"."enum_media_purpose" AS ENUM ('feed-post');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    ALTER TABLE "media"
      ADD COLUMN IF NOT EXISTS "uploaded_by" varchar,
      ADD COLUMN IF NOT EXISTS "purpose" "public"."enum_media_purpose";
    CREATE INDEX IF NOT EXISTS "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by");
    CREATE INDEX IF NOT EXISTS "media_purpose_idx" ON "media" USING btree ("purpose");

    ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "image_id" integer;
    DO $$ BEGIN
      ALTER TABLE "feed_posts"
        ADD CONSTRAINT "feed_posts_image_id_media_id_fk"
        FOREIGN KEY ("image_id") REFERENCES "public"."media"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS "feed_posts_image_idx" ON "feed_posts" USING btree ("image_id");

    WITH matches AS (
      SELECT fp."id" AS post_id, m."id" AS media_id
      FROM "feed_posts" fp
      JOIN "media" m ON m."filename" = substring(fp."image_url" FROM '[^/]+$')
      WHERE fp."image_id" IS NULL
        AND fp."image_url" LIKE 'https://%.amazonaws.com/%'
        -- Only pictures the feed composer uploaded (it always sent this alt
        -- text); covers and logos are shared and must never become one
        -- member's, to be deleted with their post.
        AND m."alt" = 'feed post image'
        -- Only a picture exactly one post shows.
        AND NOT EXISTS (
          SELECT 1 FROM "feed_posts" o
          WHERE o."id" <> fp."id" AND o."image_url" = fp."image_url"
        )
        -- And nothing else links it.
        AND NOT EXISTS (SELECT 1 FROM "events" e WHERE e."image_id" = m."id" OR e."cover_image_id" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "_events_v" v WHERE v."version_image_id" = m."id" OR v."version_cover_image_id" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "events_rels" r WHERE r."media_id" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "_events_v_rels" r WHERE r."media_id" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "speakers" sp WHERE sp."photo_id" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "sponsors" so WHERE so."logo_id" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "challenges" c WHERE c."image_id" = m."id")
        AND NOT EXISTS (SELECT 1 FROM "launchpad_projects" lp WHERE lp."cover_image_id" = m."id")
    )
    UPDATE "feed_posts" fp
      SET "image_id" = matches.media_id
      FROM matches
      WHERE fp."id" = matches.post_id
        AND NOT EXISTS (
          SELECT 1 FROM "feed_posts" o WHERE o."image_id" = matches.media_id
        );

    UPDATE "media" m
      SET "purpose" = 'feed-post', "uploaded_by" = fp."author_id"
      FROM "feed_posts" fp
      WHERE fp."image_id" = m."id" AND m."purpose" IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts" DROP CONSTRAINT IF EXISTS "feed_posts_image_id_media_id_fk";
    DROP INDEX IF EXISTS "feed_posts_image_idx";
    ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "image_id";
    DROP INDEX IF EXISTS "media_purpose_idx";
    DROP INDEX IF EXISTS "media_uploaded_by_idx";
    ALTER TABLE "media"
      DROP COLUMN IF EXISTS "purpose",
      DROP COLUMN IF EXISTS "uploaded_by";
    DROP TYPE IF EXISTS "public"."enum_media_purpose";
  `);
}
