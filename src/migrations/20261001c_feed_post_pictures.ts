// A feed post carries up to 4 pictures (#391, slice 3): the `images`
// upload relation lives in `feed_posts_rels` (Payload's hasMany layout).
//
// Expand only: the single-picture column `image_id` stays, unused by the new
// code, so the version still serving during the deploy keeps working. Every
// post's picture is copied into the list here; a later migration copies any
// written during the deploy window and drops the column.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "feed_posts_rels" (
      "id" serial PRIMARY KEY NOT NULL,
      "order" integer,
      "parent_id" integer NOT NULL,
      "path" varchar NOT NULL,
      "media_id" integer
    );

    DO $$ BEGIN
      ALTER TABLE "feed_posts_rels"
        ADD CONSTRAINT "feed_posts_rels_parent_fk"
        FOREIGN KEY ("parent_id") REFERENCES "public"."feed_posts"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    DO $$ BEGIN
      ALTER TABLE "feed_posts_rels"
        ADD CONSTRAINT "feed_posts_rels_media_fk"
        FOREIGN KEY ("media_id") REFERENCES "public"."media"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    CREATE INDEX IF NOT EXISTS "feed_posts_rels_order_idx" ON "feed_posts_rels" USING btree ("order");
    CREATE INDEX IF NOT EXISTS "feed_posts_rels_parent_idx" ON "feed_posts_rels" USING btree ("parent_id");
    CREATE INDEX IF NOT EXISTS "feed_posts_rels_path_idx" ON "feed_posts_rels" USING btree ("path");
    CREATE INDEX IF NOT EXISTS "feed_posts_rels_media_id_idx" ON "feed_posts_rels" USING btree ("media_id");
    -- A picture belongs to one post (the single-picture column had this too).
    CREATE UNIQUE INDEX IF NOT EXISTS "feed_posts_rels_images_media_unique"
      ON "feed_posts_rels" USING btree ("media_id") WHERE "path" = 'images';

    INSERT INTO "feed_posts_rels" ("order", "parent_id", "path", "media_id")
    SELECT 1, fp."id", 'images', fp."image_id"
    FROM "feed_posts" fp
    WHERE fp."image_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "feed_posts_rels" r
        WHERE r."parent_id" = fp."id" AND r."path" = 'images'
      )
      AND NOT EXISTS (
        SELECT 1 FROM "feed_posts_rels" r
        WHERE r."media_id" = fp."image_id" AND r."path" = 'images'
      );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "feed_posts" fp
      SET "image_id" = r."media_id"
      FROM "feed_posts_rels" r
      WHERE r."parent_id" = fp."id" AND r."path" = 'images' AND r."order" = 1
        AND fp."image_id" IS NULL;
    DROP TABLE IF EXISTS "feed_posts_rels" CASCADE;
  `);
}
