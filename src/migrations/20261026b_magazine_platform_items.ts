import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

/**
 * Platform content blocks in magazine issues (ADR-0044).
 * The storyline table holds only ordering, an optional intro and a live story id.
 * References are plain ids on purpose: deleting a story leaves a missing marker.
 * DDL captured from Payload's push to aitcom_magazines_scratch, 2026-10-26.
 * The news_item table holds the same fields with a live news item id.
 * Its DDL was also captured from Payload's scratch push, 2026-10-26.
 * The event table keeps a plain numeric event id; its DDL was captured from
 * Payload's scratch push on 2026-10-26. Deleting an event leaves its block.
 * This unshipped slice migration grows as later platform kinds are added.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_storyline" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "intro" varchar,
      "storyline_id" varchar NOT NULL,
      "block_name" varchar
    );
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_storyline_order_idx"
      ON "magazine_issues_blocks_storyline"("_order");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_storyline_parent_id_idx"
      ON "magazine_issues_blocks_storyline"("_parent_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_storyline_path_idx"
      ON "magazine_issues_blocks_storyline"("_path");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_storyline"
        ADD CONSTRAINT "magazine_issues_blocks_storyline_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_news_item" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "intro" varchar,
      "news_item_id" varchar NOT NULL,
      "block_name" varchar
    );
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_news_item_order_idx"
      ON "magazine_issues_blocks_news_item"("_order");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_news_item_parent_id_idx"
      ON "magazine_issues_blocks_news_item"("_parent_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_news_item_path_idx"
      ON "magazine_issues_blocks_news_item"("_path");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_news_item"
        ADD CONSTRAINT "magazine_issues_blocks_news_item_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "magazine_issues_blocks_event" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "intro" varchar,
      "event_id" numeric NOT NULL,
      "block_name" varchar
    );
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_event_order_idx"
      ON "magazine_issues_blocks_event"("_order");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_event_parent_id_idx"
      ON "magazine_issues_blocks_event"("_parent_id");
    CREATE INDEX IF NOT EXISTS "magazine_issues_blocks_event_path_idx"
      ON "magazine_issues_blocks_event"("_path");
    DO $$ BEGIN
      ALTER TABLE "magazine_issues_blocks_event"
        ADD CONSTRAINT "magazine_issues_blocks_event_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."magazine_issues"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null; END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "magazine_issues_blocks_event";
    DROP TABLE IF EXISTS "magazine_issues_blocks_news_item";
    DROP TABLE IF EXISTS "magazine_issues_blocks_storyline";
  `);
}
