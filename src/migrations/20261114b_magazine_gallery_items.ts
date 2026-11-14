// Community gallery (spec 2026-11-13), slice 4: the block table for the
// `galleryItem` issue item kind (ADR-0043). Same shape as the other platform
// item blocks (20261026b, with the `image` column of 20261029b): ordering,
// an optional intro and a plain numeric gallery item id. The reference has
// no foreign key on purpose (ADR-0044 D1): deleting a gallery item leaves
// its block, which then shows as missing. Additive and idempotent.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_gallery_item" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "intro" varchar,
      "image" jsonb,
      "gallery_item_id" numeric NOT NULL,
      "block_name" varchar
    );
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_gallery_item_order_idx"
      ON "magazine_issues_blocks_gallery_item"("_order");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_gallery_item_parent_id_idx"
      ON "magazine_issues_blocks_gallery_item"("_parent_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_gallery_item_path_idx"
      ON "magazine_issues_blocks_gallery_item"("_path");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_gallery_item"
        ADD CONSTRAINT "magazine_issues_blocks_gallery_item_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "magazine_issues_blocks_gallery_item";
  `);
}
