import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * `feed_posts.like_count` and `comment_count` fell behind their rows:
 * - while `points_boosts_id` was missing (see 20260927a), toggleLike saved the
 *   `feed_likes` row and then failed to update the post;
 * - addComment never raised `comment_count` at all.
 * The code now recounts from the rows after every change
 * (syncFeedPostCounters). This recounts once for existing posts, with the
 * same rule: all likes, comments that are not soft-deleted. Idempotent.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "feed_posts" p
    SET "like_count" = c.likes, "comment_count" = c.comments
    FROM (
      SELECT
        fp."id",
        (SELECT count(*) FROM "feed_likes" fl WHERE fl."post_id" = fp."id") AS likes,
        (
          SELECT count(*) FROM "feed_comments" fc
          WHERE fc."post_id" = fp."id" AND fc."is_deleted" IS NOT TRUE
        ) AS comments
      FROM "feed_posts" fp
    ) c
    WHERE p."id" = c."id"
      AND (
        p."like_count" IS DISTINCT FROM c.likes
        OR p."comment_count" IS DISTINCT FROM c.comments
      );
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // The drifted counts were wrong; there is nothing worth restoring.
}
