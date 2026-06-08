import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "topic_slug" varchar`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "feed_posts_topic_slug_idx" ON "feed_posts"("topic_slug")`));
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" ADD COLUMN IF NOT EXISTS "is_pinned" boolean DEFAULT false`));
  await db.execute(sql.raw(`UPDATE "feed_posts" SET "topic_slug" = 'general' WHERE "topic_slug" IS NULL`));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "community_topics" (
      "id" serial PRIMARY KEY,
      "label" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "emoji" varchar,
      "community_id" varchar NOT NULL,
      "sort_order" numeric DEFAULT 0,
      "is_default" boolean DEFAULT false,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "community_topics_community_id_idx" ON "community_topics"("community_id")`));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "community_topics_slug_idx" ON "community_topics"("slug")`));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS "community_links" (
      "id" serial PRIMARY KEY,
      "label" varchar NOT NULL,
      "url" varchar NOT NULL,
      "emoji" varchar,
      "community_id" varchar NOT NULL,
      "sort_order" numeric DEFAULT 0,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    )
  `));
  await db.execute(sql.raw(`CREATE INDEX IF NOT EXISTS "community_links_community_id_idx" ON "community_links"("community_id")`));
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "community_links"`));
  await db.execute(sql.raw(`DROP TABLE IF EXISTS "community_topics"`));
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "is_pinned"`));
  await db.execute(sql.raw(`DROP INDEX IF EXISTS "feed_posts_topic_slug_idx"`));
  await db.execute(sql.raw(`ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "topic_slug"`));
}
