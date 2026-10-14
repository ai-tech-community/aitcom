import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/** DDL only. Suggestions arrive from members, not from this migration. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app.news_story_suggestion (
      id varchar(255) PRIMARY KEY,
      user_id varchar(255) NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
      body text NOT NULL,
      url text,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at timestamptz,
      CHECK (char_length(btrim(body)) BETWEEN 1 AND 500),
      CHECK (url IS NULL OR url ~ '^https://')
    );
    CREATE INDEX IF NOT EXISTS news_story_suggestion_user_created_idx
      ON app.news_story_suggestion (user_id, created_at);
    CREATE INDEX IF NOT EXISTS news_story_suggestion_open_idx
      ON app.news_story_suggestion (created_at)
      WHERE reviewed_at IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS app.news_story_suggestion;
  `);
}
