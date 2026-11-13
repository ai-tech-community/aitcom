// Community gallery (spec 2026-11-13, ADR-0049), slice 2: a feed post can
// announce one gallery upload batch, and the old admin-only `Events.gallery`
// field is gone (the event page shows the community gallery instead).
//
// feed_posts.gallery_batch_id follows Payload's own shape for a unique
// relationship (FK ON DELETE set null, unique index `<table>_<field>_idx`):
// one batch is announced by at most one post.
//
// This migration only adds. Events.gallery was the only hasMany media
// relation on events, so the new code no longer reads `media_id` on
// events_rels or _events_v_rels, but production applies migrations during
// the build while the old deployment still serves, and the old code selects
// `media_id` by name. The column, its index and its foreign key therefore
// stay until a follow-up migration drops them once this deploy is live; a
// leftover nullable column is harmless (the deploy's schema check only
// reports missing columns).
//
// The empty-gallery guard still runs: if either table holds a gallery row
// (`gallery` on the live table, `version.gallery` on the versions table) or
// any media link, the migration raises and changes nothing. That signals
// data nobody expected and protects the follow-up drop. The guard reads
// `media_id` only while the column exists, so it also holds after the drop.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    DECLARE
      rels record;
      found boolean;
    BEGIN
      FOR rels IN
        SELECT * FROM (VALUES
          ('events_rels', 'gallery'),
          ('_events_v_rels', 'version.gallery')
        ) AS t(table_name, gallery_path)
      LOOP
        EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE "path" = %L)',
          rels.table_name, rels.gallery_path)
          INTO found;
        IF NOT found AND EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = rels.table_name
            AND column_name = 'media_id'
        ) THEN
          EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I WHERE "media_id" IS NOT NULL)',
            rels.table_name)
            INTO found;
        END IF;
        IF found THEN
          RAISE EXCEPTION 'events gallery not empty: % still links event pictures (path %, or a media_id); move them to the community gallery before dropping the field',
            rels.table_name, rels.gallery_path;
        END IF;
      END LOOP;
    END $$;

    ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "gallery_batch_id" integer;
    DO $$ BEGIN
      ALTER TABLE "feed_posts"
        ADD CONSTRAINT "feed_posts_gallery_batch_id_gallery_batches_id_fk"
        FOREIGN KEY ("gallery_batch_id") REFERENCES "public"."gallery_batches"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE UNIQUE INDEX IF NOT EXISTS "feed_posts_gallery_batch_idx" ON "feed_posts" USING btree ("gallery_batch_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts" DROP CONSTRAINT IF EXISTS "feed_posts_gallery_batch_id_gallery_batches_id_fk";
    DROP INDEX IF EXISTS "feed_posts_gallery_batch_idx";
    ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "gallery_batch_id";
  `);
}
