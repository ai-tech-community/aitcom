import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/** DDL only. Points for stories already published are filled by the cron. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app.news_contribution (
      id varchar(255) PRIMARY KEY,
      user_id varchar(255) NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
      topic_key varchar(100) NOT NULL,
      title varchar(200) NOT NULL,
      kind text NOT NULL CHECK (kind IN ('claim', 'published', 'breaking')),
      points integer NOT NULL CHECK (points >= 0),
      storyline_id varchar(255) REFERENCES app.news_storyline(id) ON DELETE SET NULL,
      region text CHECK (region IS NULL OR region IN ('eu', 'il', 'asia')),
      expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS news_contribution_user_topic_kind_idx
      ON app.news_contribution (user_id, topic_key, kind);
    CREATE UNIQUE INDEX IF NOT EXISTS news_contribution_breaking_topic_idx
      ON app.news_contribution (topic_key)
      WHERE kind = 'breaking';
    CREATE INDEX IF NOT EXISTS news_contribution_created_idx
      ON app.news_contribution (created_at);
    CREATE INDEX IF NOT EXISTS news_contribution_user_created_idx
      ON app.news_contribution (user_id, created_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS app.news_contribution;
  `);
}
