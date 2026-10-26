import { sql } from "@payloadcms/db-postgres";
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";

/**
 * Platform content blocks in magazine issues (ADR-0044).
 * The storyline table holds only ordering, an optional intro and a live story id.
 * References are plain ids on purpose: deleting a story leaves a missing marker.
 * DDL captured from Payload's push to aitcom_magazines_scratch, 2026-10-26.
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
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql`DROP TABLE IF EXISTS "magazine_issues_blocks_storyline";`,
  );
}
