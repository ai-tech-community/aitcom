import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// Fixed historical table names: later item kinds get their own migrations.
const TABLES = [
  "magazine_issues_blocks_article",
  "magazine_issues_blocks_editorial",
  "magazine_issues_blocks_storyline",
  "magazine_issues_blocks_news_item",
  "magazine_issues_blocks_event",
  "magazine_issues_blocks_forum_thread",
  "magazine_issues_blocks_launchpad_project",
] as const;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of TABLES)
    await db.execute(
      sql.raw(
        `ALTER TABLE "public"."${table}" ADD COLUMN IF NOT EXISTS "image" jsonb;`,
      ),
    );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const table of TABLES)
    await db.execute(
      sql.raw(`ALTER TABLE "public"."${table}" DROP COLUMN IF EXISTS "image";`),
    );
}
