import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

// Enforce the "every feed post belongs to exactly one topic" invariant at the
// DB level. 20260608a added feed_posts.topic_slug as nullable; the app always
// writes a value ('general' default), but the column should not permit NULL.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(
      `UPDATE "feed_posts" SET "topic_slug" = 'general' WHERE "topic_slug" IS NULL`,
    ),
  );
  await db.execute(
    sql.raw(
      `ALTER TABLE "feed_posts" ALTER COLUMN "topic_slug" SET DEFAULT 'general'`,
    ),
  );
  await db.execute(
    sql.raw(`ALTER TABLE "feed_posts" ALTER COLUMN "topic_slug" SET NOT NULL`),
  );
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(
    sql.raw(`ALTER TABLE "feed_posts" ALTER COLUMN "topic_slug" DROP NOT NULL`),
  );
  await db.execute(
    sql.raw(`ALTER TABLE "feed_posts" ALTER COLUMN "topic_slug" DROP DEFAULT`),
  );
}
