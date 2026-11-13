// Community gallery (spec 2026-11-13, ADR-0049), slice 2: a feed post can
// announce one gallery upload batch, and the old admin-only `Events.gallery`
// field is gone (the event page shows the community gallery instead).
//
// feed_posts.gallery_batch_id follows Payload's own shape for a unique
// relationship (FK ON DELETE set null, unique index `<table>_<field>_idx`):
// one batch is announced by at most one post.
//
// Events.gallery was the only hasMany media relation on events, so Payload
// no longer expects `media_id` on events_rels or _events_v_rels. Production
// auto-applies migrations on deploy, so the drop is guarded: if either table
// still holds a gallery row (`gallery` on the live table, `version.gallery`
// on the versions table) or any media link, the migration raises and
// changes nothing instead of deleting pictures. The guard reads `media_id`
// only while the column exists, so a re-run after success is a no-op.
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

    ALTER TABLE "events_rels" DROP CONSTRAINT IF EXISTS "events_rels_media_fk";
    DROP INDEX IF EXISTS "events_rels_media_id_idx";
    ALTER TABLE "events_rels" DROP COLUMN IF EXISTS "media_id";

    ALTER TABLE "_events_v_rels" DROP CONSTRAINT IF EXISTS "_events_v_rels_media_fk";
    DROP INDEX IF EXISTS "_events_v_rels_media_id_idx";
    ALTER TABLE "_events_v_rels" DROP COLUMN IF EXISTS "media_id";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "events_rels" ADD COLUMN IF NOT EXISTS "media_id" integer;
    CREATE INDEX IF NOT EXISTS "events_rels_media_id_idx" ON "events_rels" USING btree ("media_id");
    DO $$ BEGIN
      ALTER TABLE "events_rels"
        ADD CONSTRAINT "events_rels_media_fk"
        FOREIGN KEY ("media_id") REFERENCES "public"."media"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "_events_v_rels" ADD COLUMN IF NOT EXISTS "media_id" integer;
    CREATE INDEX IF NOT EXISTS "_events_v_rels_media_id_idx" ON "_events_v_rels" USING btree ("media_id");
    DO $$ BEGIN
      ALTER TABLE "_events_v_rels"
        ADD CONSTRAINT "_events_v_rels_media_fk"
        FOREIGN KEY ("media_id") REFERENCES "public"."media"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    ALTER TABLE "feed_posts" DROP CONSTRAINT IF EXISTS "feed_posts_gallery_batch_id_gallery_batches_id_fk";
    DROP INDEX IF EXISTS "feed_posts_gallery_batch_idx";
    ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "gallery_batch_id";
  `);
}
