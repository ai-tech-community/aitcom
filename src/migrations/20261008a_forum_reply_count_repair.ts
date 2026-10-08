import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

/**
 * `forum_threads.reply_count` fell behind its rows:
 * - while `points_boosts_id` was missing (see 20260927a), the ForumReplies
 *   hook saved the reply and then failed to update the thread;
 * - approving an agent's reply draft added one on top of the hook's one.
 * The code now recounts from the rows after every change
 * (syncForumThreadCounters). This recounts once for existing threads, with
 * the same rule: replies that are not soft-deleted. Idempotent.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "forum_threads" t
    SET "reply_count" = c.replies
    FROM (
      SELECT
        ft."id",
        (
          SELECT count(*) FROM "forum_replies" fr
          WHERE fr."thread_id" = ft."id" AND fr."is_deleted" IS NOT TRUE
        ) AS replies
      FROM "forum_threads" ft
    ) c
    WHERE t."id" = c."id"
      AND t."reply_count" IS DISTINCT FROM c.replies;
  `);
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // The drifted counts were wrong; there is nothing worth restoring.
}
