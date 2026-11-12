import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app.community_connection_type (
      id varchar(255) PRIMARY KEY NOT NULL,
      community_id varchar(255) NOT NULL REFERENCES app.community(id),
      name varchar(80) NOT NULL,
      description text NOT NULL DEFAULT '',
      mode varchar(20) NOT NULL CHECK (mode IN ('shared', 'complementary')),
      prompt_a varchar(160) NOT NULL,
      prompt_b varchar(160) NOT NULL DEFAULT '',
      topics jsonb NOT NULL DEFAULT '[]',
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS connection_type_community_idx ON app.community_connection_type(community_id);
    CREATE TABLE IF NOT EXISTS app.community_matching_profile (
      community_id varchar(255) NOT NULL REFERENCES app.community(id),
      user_id varchar(255) NOT NULL REFERENCES app."user"(id),
      opted_in boolean NOT NULL DEFAULT false,
      city varchar(100) NOT NULL DEFAULT '',
      languages jsonb NOT NULL DEFAULT '[]',
      meeting varchar(20) NOT NULL DEFAULT 'either' CHECK (meeting IN ('either', 'online', 'in_person')),
      answers jsonb NOT NULL DEFAULT '{}',
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (community_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS app.community_match_dismissal (
      community_id varchar(255) NOT NULL REFERENCES app.community(id),
      pair_key varchar(600) NOT NULL,
      dismissed_by varchar(255) NOT NULL REFERENCES app."user"(id),
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (community_id, pair_key)
    );
    ALTER TABLE app.introduction ADD COLUMN IF NOT EXISTS connection_type_id varchar(255) REFERENCES app.community_connection_type(id);
    ALTER TABLE app.introduction ADD COLUMN IF NOT EXISTS reason text;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE app.introduction DROP COLUMN IF EXISTS reason;
    ALTER TABLE app.introduction DROP COLUMN IF EXISTS connection_type_id;
    DROP TABLE IF EXISTS app.community_match_dismissal;
    DROP TABLE IF EXISTS app.community_matching_profile;
    DROP TABLE IF EXISTS app.community_connection_type;
  `);
}
