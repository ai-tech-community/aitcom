import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/** DDL only. No fictional stories or archive backfill. */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app.news_storyline (
      id varchar(255) PRIMARY KEY, slug varchar(100) NOT NULL,
      title_en text NOT NULL, title_nl text NOT NULL DEFAULT '',
      overview_en text NOT NULL DEFAULT '', overview_nl text NOT NULL DEFAULT '',
      questions_en jsonb NOT NULL DEFAULT '[]', questions_nl jsonb NOT NULL DEFAULT '[]',
      status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
      revision integer NOT NULL DEFAULT 1,
      created_by varchar(255) REFERENCES app."user"(id) ON DELETE SET NULL,
      updated_by varchar(255) REFERENCES app."user"(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS news_storyline_slug_idx ON app.news_storyline(slug);
    CREATE TABLE IF NOT EXISTS app.news_storyline_article (
      storyline_id varchar(255) NOT NULL REFERENCES app.news_storyline(id) ON DELETE CASCADE,
      article_id varchar(255) NOT NULL REFERENCES app.news_item(id) ON DELETE CASCADE,
      note_en text NOT NULL DEFAULT '', note_nl text NOT NULL DEFAULT '',
      evidence varchar(240) NOT NULL DEFAULT '', PRIMARY KEY (storyline_id, article_id)
    );
    CREATE INDEX IF NOT EXISTS news_storyline_article_item_idx ON app.news_storyline_article(article_id);
    CREATE TABLE IF NOT EXISTS app.news_storyline_connection (
      source_id varchar(255) NOT NULL, target_id varchar(255) NOT NULL,
      relation text NOT NULL CHECK (relation IN ('shared_development','builds_on','contrasting_claims')),
      explanation_en text NOT NULL, explanation_nl text NOT NULL DEFAULT '',
      from_article_id varchar(255) NOT NULL, to_article_id varchar(255) NOT NULL,
      PRIMARY KEY (source_id, target_id, relation), CHECK (source_id <> target_id),
      FOREIGN KEY (source_id, from_article_id) REFERENCES app.news_storyline_article(storyline_id, article_id) ON DELETE CASCADE,
      FOREIGN KEY (target_id, to_article_id) REFERENCES app.news_storyline_article(storyline_id, article_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS news_storyline_connection_target_idx ON app.news_storyline_connection(target_id);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS app.news_storyline_connection;
    DROP TABLE IF EXISTS app.news_storyline_article;
    DROP TABLE IF EXISTS app.news_storyline;
  `);
}
