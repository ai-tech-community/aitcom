// Community gallery (spec 2026-11-13, ADR-0049): the follow-up drop that
// 20261113b_gallery_feed_posts deferred.
//
// `Events.gallery` was the only hasMany media relation on events. Since that
// field left the collection (#570), no deployed code reads `media_id` on
// events_rels or _events_v_rels: the deployment that serves while this
// migration runs during the build already ships without the field, so the
// drop is safe in the build window (the reason 20261113b kept the column).
//
// The same empty-gallery guard as 20261113b runs first: if either table
// still holds a gallery row (`gallery` on the live table, `version.gallery`
// on the versions table) or any media link, the migration raises and drops
// nothing. Production held 0 such rows on 14 Nov 2026.
//
// Names are Payload's own (checked on production): `<table>_media_fk` and
// `<table>_media_id_idx`. Every step is IF EXISTS, so a re-run is a no-op.
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
          RAISE EXCEPTION 'events gallery not empty: % still links event pictures (path %, or a media_id); move them to the community gallery before dropping the column',
            rels.table_name, rels.gallery_path;
        END IF;
      END LOOP;
    END $$;

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
    DO $$ BEGIN
      ALTER TABLE "events_rels"
        ADD CONSTRAINT "events_rels_media_fk"
        FOREIGN KEY ("media_id") REFERENCES "public"."media"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "events_rels_media_id_idx" ON "events_rels" USING btree ("media_id");

    ALTER TABLE "_events_v_rels" ADD COLUMN IF NOT EXISTS "media_id" integer;
    DO $$ BEGIN
      ALTER TABLE "_events_v_rels"
        ADD CONSTRAINT "_events_v_rels_media_fk"
        FOREIGN KEY ("media_id") REFERENCES "public"."media"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
    CREATE INDEX IF NOT EXISTS "_events_v_rels_media_id_idx" ON "_events_v_rels" USING btree ("media_id");
  `);
}
