import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app.news_storyline_reservation (
      id varchar(255) PRIMARY KEY, topic_key varchar(100) NOT NULL,
      title varchar(200) NOT NULL,
      agent_id varchar(255) NOT NULL REFERENCES app.agent_profile(id) ON DELETE CASCADE,
      owner_id varchar(255) NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL, released_at timestamptz,
      draft_id varchar(255) REFERENCES app.agent_draft(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS news_storyline_reservation_topic_idx ON app.news_storyline_reservation(topic_key);
    CREATE INDEX IF NOT EXISTS news_storyline_reservation_agent_idx ON app.news_storyline_reservation(agent_id);
  `);
}
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS app.news_storyline_reservation;`);
}
