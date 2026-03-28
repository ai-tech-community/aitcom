import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // ── Add community_id to all collections that gained it ──────────────
  // None of these tables had community_id before; all are nullable.
  const tablesNeedingCommunityId = [
    "forum_threads",
    "forum_replies",
    "community_ideas",
    "idea_votes",
    "challenges",
    "community_rules",
    "rules_acceptance",
    "launchpad_projects",
    "jobs",
    "comments",
    "events",
  ] as const;

  for (const table of tablesNeedingCommunityId) {
    await db.execute(sql.raw(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "community_id" varchar`
    ));
    await db.execute(sql.raw(
      `CREATE INDEX IF NOT EXISTS "${table}_community_id_idx" ON "${table}"("community_id")`
    ));
  }

  // ── forum_threads: add soft-delete / edit tracking ──────────────────
  await db.execute(sql`
    ALTER TABLE "forum_threads"
      ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "is_edited" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "edited_at" timestamp(3) with time zone;
  `);

  // ── forum_replies: add author_type enum + soft-delete / edit tracking
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE "enum_forum_replies_author_type" AS ENUM('member', 'agent');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    ALTER TABLE "forum_replies"
      ADD COLUMN IF NOT EXISTS "author_type" "enum_forum_replies_author_type" DEFAULT 'member',
      ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "is_edited" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "edited_at" timestamp(3) with time zone;
  `);

  // ── community_rules: add columns from schema redesign ───────────────
  await db.execute(sql`
    ALTER TABLE "community_rules"
      ADD COLUMN IF NOT EXISTS "version" numeric DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "effective_date" timestamp(3) with time zone;
  `);

  // ── feed_posts: create table or add missing columns ─────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "feed_posts" (
      "id" serial PRIMARY KEY,
      "content" varchar NOT NULL,
      "image_url" varchar,
      "author_id" varchar NOT NULL,
      "author_name" varchar,
      "community_id" varchar,
      "like_count" numeric DEFAULT 0,
      "comment_count" numeric DEFAULT 0,
      "is_deleted" boolean DEFAULT false,
      "is_edited" boolean DEFAULT false,
      "edited_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `);

  // If the table already existed, ensure new columns are present
  await db.execute(sql`
    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "is_edited" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "edited_at" timestamp(3) with time zone,
      ADD COLUMN IF NOT EXISTS "like_count" numeric DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "comment_count" numeric DEFAULT 0;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "feed_posts_author_id_idx"
      ON "feed_posts"("author_id");
    CREATE INDEX IF NOT EXISTS "feed_posts_community_id_idx"
      ON "feed_posts"("community_id");
  `);

  // ── feed_comments: create table or add missing columns ──────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "feed_comments" (
      "id" serial PRIMARY KEY,
      "post_id" integer NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
      "content" varchar NOT NULL,
      "author_id" varchar NOT NULL,
      "author_name" varchar,
      "community_id" varchar,
      "is_deleted" boolean DEFAULT false,
      "is_edited" boolean DEFAULT false,
      "edited_at" timestamp(3) with time zone,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `);

  // If the table already existed, ensure new columns are present
  await db.execute(sql`
    ALTER TABLE "feed_comments"
      ADD COLUMN IF NOT EXISTS "is_deleted" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "is_edited" boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS "edited_at" timestamp(3) with time zone;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "feed_comments_author_id_idx"
      ON "feed_comments"("author_id");
    CREATE INDEX IF NOT EXISTS "feed_comments_community_id_idx"
      ON "feed_comments"("community_id");
  `);

  // ── feed_likes: create table ────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "feed_likes" (
      "id" serial PRIMARY KEY,
      "post_id" integer NOT NULL REFERENCES "feed_posts"("id") ON DELETE CASCADE,
      "user_id" varchar NOT NULL,
      "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "feed_likes_user_id_idx"
      ON "feed_likes"("user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Drop feed tables
  await db.execute(sql`DROP TABLE IF EXISTS "feed_likes";`);
  await db.execute(sql`DROP TABLE IF EXISTS "feed_comments";`);
  await db.execute(sql`DROP TABLE IF EXISTS "feed_posts";`);

  // Revert community_rules redesign columns
  await db.execute(sql`
    ALTER TABLE "community_rules"
      DROP COLUMN IF EXISTS "version",
      DROP COLUMN IF EXISTS "effective_date";
  `);

  // Remove forum_replies additions
  await db.execute(sql`
    ALTER TABLE "forum_replies"
      DROP COLUMN IF EXISTS "edited_at",
      DROP COLUMN IF EXISTS "is_edited",
      DROP COLUMN IF EXISTS "is_deleted",
      DROP COLUMN IF EXISTS "author_type";
  `);
  await db.execute(sql`DROP TYPE IF EXISTS "enum_forum_replies_author_type";`);

  // Remove forum_threads additions
  await db.execute(sql`
    ALTER TABLE "forum_threads"
      DROP COLUMN IF EXISTS "edited_at",
      DROP COLUMN IF EXISTS "is_edited",
      DROP COLUMN IF EXISTS "is_deleted";
  `);

  // Remove community_id from all tables
  const tables = [
    "forum_threads", "forum_replies", "community_ideas", "idea_votes",
    "challenges", "community_rules", "rules_acceptance", "launchpad_projects",
    "jobs", "comments", "events",
  ];
  for (const table of tables) {
    await db.execute(sql.raw(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "community_id"`));
  }
}
