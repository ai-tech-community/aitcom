// Published news stories are mailed by /api/cron/news-storyline-announce,
// not by the publish request. published_at stays null on stories that were
// already published, so turning the fan-out flag on does not mail the archive.
// announced_at is set when that mailing finishes. The announcement table's
// primary key is one send per member per story.
// news_story_email_opted_out_at is null until the member uses the unsubscribe
// link. ADD COLUMN without a default is metadata-only and stays inside the
// 120s deploy limit. No row is rewritten here.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE app.news_storyline
      ADD COLUMN IF NOT EXISTS "published_at" timestamp(3) with time zone;
    ALTER TABLE app.news_storyline
      ADD COLUMN IF NOT EXISTS "announced_at" timestamp(3) with time zone;
    ALTER TABLE app."user"
      ADD COLUMN IF NOT EXISTS "news_story_email_opted_out_at" timestamp(3) with time zone;
    CREATE TABLE IF NOT EXISTS app.news_storyline_announcement (
      storyline_id varchar(255) NOT NULL REFERENCES app.news_storyline(id) ON DELETE CASCADE,
      user_id varchar(255) NOT NULL REFERENCES app."user"(id) ON DELETE CASCADE,
      sent_at timestamp(3) with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (storyline_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS news_storyline_unannounced_idx
      ON app.news_storyline (published_at, id)
      WHERE announced_at IS NULL AND published_at IS NOT NULL AND status = 'published';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS news_storyline_unannounced_idx;
    DROP TABLE IF EXISTS app.news_storyline_announcement;
    ALTER TABLE app.news_storyline DROP COLUMN IF EXISTS "announced_at";
    ALTER TABLE app.news_storyline DROP COLUMN IF EXISTS "published_at";
    ALTER TABLE app."user" DROP COLUMN IF EXISTS "news_story_email_opted_out_at";
  `);
}
