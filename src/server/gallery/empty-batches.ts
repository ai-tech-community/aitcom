import { sql } from "@payloadcms/db-postgres";

import type { Payload } from "./deps";

/**
 * Deletes up to `limit` finished batches created before `createdBefore` that
 * hold no items and announced nothing, oldest first, and returns their ids.
 * "Announced nothing" means both that the batch stores no `feedPostId` and
 * that no feed post points at it: if the announcement made its post but
 * storing the post on the batch failed, the post must still keep its batch.
 *
 * One statement, so the "no items" test is part of the selection: a page
 * of finished batches read through Payload and counted one by one would
 * fill up with batches that still have items (every batch keeps its ready
 * items) and never reach the empty ones. A finished batch never gains
 * items (`startItem` needs an open batch inside its finish window), and the
 * required `gallery_items.batch_id` foreign key makes the delete fail
 * rather than orphan an item if one appeared anyway. The batch has no hooks to run; its admin-lock rows go
 * with it (ON DELETE cascade).
 */
export async function deleteEmptyFinishedBatches(
  payload: Payload,
  input: { createdBefore: string; limit: number },
): Promise<number[]> {
  const { rows } = await payload.db.drizzle.execute(sql`
    DELETE FROM "gallery_batches"
      WHERE "id" IN (
        SELECT b."id" FROM "gallery_batches" b
          WHERE b."status" = 'finished'
            AND b."created_at" < ${input.createdBefore}
            AND b."feed_post_id" IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM "feed_posts" fp WHERE fp."gallery_batch_id" = b."id"
            )
            AND NOT EXISTS (
              SELECT 1 FROM "gallery_items" i WHERE i."batch_id" = b."id"
            )
          ORDER BY b."created_at"
          LIMIT ${input.limit}
      )
      RETURNING "id"
  `);
  return rows.map((row) => Number((row as { id: number }).id));
}
