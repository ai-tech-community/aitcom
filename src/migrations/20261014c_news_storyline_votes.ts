import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * DDL only. One row per member per story. Votes are cast by members after
 * deploy, never inserted here. The primary key is the unique (story_id, user_id)
 * pair, so a member cannot hold two votes on the same story.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app.news_storyline_vote (
      story_id varchar(255) NOT NULL REFERENCES app.news_storyline(id) ON DELETE CASCADE,
      user_id varchar(255) NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
      value integer NOT NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT news_storyline_vote_value_check CHECK (value IN (-1, 1)),
      CONSTRAINT news_storyline_vote_story_user_key UNIQUE (story_id, user_id),
      PRIMARY KEY (story_id, user_id)
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS app.news_storyline_vote;
  `);
}
