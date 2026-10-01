import { sql } from "@payloadcms/db-postgres";

import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * A feed post image younger than this may still be on its way into a post
 * (picked in the composer, uploaded on Save in the edit form), so it is
 * never swept.
 */
export const UNUSED_FEED_IMAGE_MIN_AGE_HOURS = 24;

/** Images handled per run; the oldest go first, the rest wait a day. */
const SWEEP_PAGE_SIZE = 200;

/**
 * Deletes feed post images no post links: picked and then never posted,
 * imported for a draft that was then not published, or left when an edit's
 * best-effort cleanup failed. Only images uploaded as feed post images are
 * considered; shared uploads (covers, logos) are never touched. Deleting a
 * media document also deletes its files.
 */
export async function sweepUnusedFeedImages(deps: {
  payload: Payload;
  now?: () => Date;
  log?: (message: string, detail: unknown) => void;
}): Promise<{ removed: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(
    now.getTime() - UNUSED_FEED_IMAGE_MIN_AGE_HOURS * 60 * 60 * 1000,
  );
  // Asked of the database directly: the unused images, oldest first. Paging
  // through all feed post images and skipping the linked ones would stall
  // once the oldest page is all in use.
  const { rows } = await deps.payload.db.drizzle.execute(sql`
    SELECT m."id" FROM "media" m
    WHERE m."purpose" = 'feed-post'
      AND m."created_at" < ${cutoff.toISOString()}
      AND NOT EXISTS (
        SELECT 1 FROM "feed_posts" fp WHERE fp."image_id" = m."id"
      )
    ORDER BY m."created_at"
    LIMIT ${SWEEP_PAGE_SIZE}
  `);
  const unused = rows.map((row) => Number((row as { id: unknown }).id));

  let removed = 0;
  let failed = 0;
  for (const id of unused) {
    try {
      await deps.payload.delete({ collection: "media", id });
      removed++;
    } catch (error) {
      failed++;
      (deps.log ?? console.error)("[unused-feed-images] removal failed", {
        imageId: id,
        error,
      });
    }
  }
  return { removed, failed };
}
