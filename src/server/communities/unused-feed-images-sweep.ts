import { sql } from "@payloadcms/db-postgres";

import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * A feed post image younger than this may still be on its way into a post
 * (picked in the composer, uploaded on Save in the edit form), so it is
 * never swept.
 */
export const UNUSED_FEED_IMAGE_MIN_AGE_HOURS = 24;

/** Images read per query; the oldest go first. */
const SWEEP_PAGE_SIZE = 200;
/** Pages per run, so one run stays well inside the cron's time limit. */
const SWEEP_MAX_PAGES = 10;

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
  let removed = 0;
  let failed = 0;
  const failedIds: number[] = [];
  for (let page = 0; page < SWEEP_MAX_PAGES; page++) {
    const unused = await unusedImages(deps.payload, cutoff, failedIds);
    for (const id of unused) {
      try {
        // Checked again right before deleting: a post may have taken the
        // image since the page was read. (If one still slips in, the media
        // delete hook unlinks it cleanly.)
        if (await isLinked(deps.payload, id)) continue;
        await deps.payload.delete({ collection: "media", id });
        removed++;
      } catch (error) {
        failed++;
        failedIds.push(id);
        (deps.log ?? console.error)("[unused-feed-images] removal failed", {
          imageId: id,
          error,
        });
      }
    }
    if (unused.length < SWEEP_PAGE_SIZE) break;
  }
  return { removed, failed };
}

/**
 * Old feed post images no post links, oldest first. Asked of the database
 * directly: paging through all feed post images and skipping the linked
 * ones would stall once the oldest page is all in use. Images that failed
 * to delete in this run are left out, so a stuck one cannot fill the page.
 */
async function unusedImages(
  payload: Payload,
  cutoff: Date,
  skip: readonly number[],
): Promise<number[]> {
  const { rows } = await payload.db.drizzle.execute(sql`
    SELECT m."id" FROM "media" m
    WHERE m."purpose" = 'feed-post'
      AND m."created_at" < ${cutoff.toISOString()}
      AND NOT EXISTS (
        SELECT 1 FROM "feed_posts" fp WHERE fp."image_id" = m."id"
      )
      ${skip.length > 0 ? sql`AND m."id" NOT IN ${skip}` : sql``}
    ORDER BY m."created_at"
    LIMIT ${SWEEP_PAGE_SIZE}
  `);
  return rows.map((row) => Number((row as { id: unknown }).id));
}

async function isLinked(payload: Payload, imageId: number): Promise<boolean> {
  const { totalDocs } = await payload.count({
    collection: "feed-posts",
    where: { image: { equals: imageId } },
  });
  return totalDocs > 0;
}
