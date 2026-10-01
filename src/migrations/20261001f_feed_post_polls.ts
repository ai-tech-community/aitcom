// Polls on feed posts (#391, slice 6). The post's text is the question;
// its 2-4 options are a Payload array on the post, and votes (one per
// member per post, changeable until the poll closes) live in
// app.feed_poll_vote. Additive: no existing post has a poll.
//
// Votes carry the option id without a foreign key to the options table on
// purpose: Payload rewrites a post's array rows on save, and a cascade from
// that would silently delete votes. Code that removes a poll deletes its
// votes itself; the post's own deletion cascades.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "feed_posts"
      ADD COLUMN IF NOT EXISTS "poll_closes_at" timestamp(3) with time zone;

    CREATE TABLE IF NOT EXISTS "feed_posts_poll_options" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL
    );
    DO $$ BEGIN
      ALTER TABLE "feed_posts_poll_options"
        ADD CONSTRAINT "feed_posts_poll_options_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."feed_posts"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN null;
    END $$;
    CREATE INDEX IF NOT EXISTS "feed_posts_poll_options_order_idx"
      ON "feed_posts_poll_options" USING btree ("_order");
    CREATE INDEX IF NOT EXISTS "feed_posts_poll_options_parent_id_idx"
      ON "feed_posts_poll_options" USING btree ("_parent_id");

    CREATE TABLE IF NOT EXISTS "app"."feed_poll_vote" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "post_id" integer NOT NULL
        REFERENCES "public"."feed_posts"("id") ON DELETE CASCADE,
      "user_id" varchar(255) NOT NULL
        REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "option_id" varchar(255) NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "feed_poll_vote_post_user_idx"
      ON "app"."feed_poll_vote" USING btree ("post_id", "user_id");
    CREATE INDEX IF NOT EXISTS "feed_poll_vote_post_option_idx"
      ON "app"."feed_poll_vote" USING btree ("post_id", "option_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."feed_poll_vote";
    DROP TABLE IF EXISTS "feed_posts_poll_options";
    ALTER TABLE "feed_posts" DROP COLUMN IF EXISTS "poll_closes_at";
  `);
}
