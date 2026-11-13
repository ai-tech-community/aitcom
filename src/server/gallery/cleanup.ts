import { ABANDONED_UPLOAD_HOURS } from "@/lib/video-rules";
import type {
  ObjectStorage,
  ObjectStorageSource,
} from "@/server/media/object-storage";

import type { Payload } from "./deps";
import { itemFileKeys } from "./item-files";
import { closeBatch } from "./uploads";

/** Rows handled per run and kind; the oldest go first, the rest wait a day. */
const CLEANUP_PAGE_SIZE = 200;

/**
 * Daily cleanup of gallery uploads left behind (spec 2026-11-13, Cleanup;
 * ADR-0049). Mirrors the classroom file cleanup
 * (`material-uploads-cleanup.ts`).
 *
 * 1. Items `uploading` or `failed` older than ABANDONED_UPLOAD_HOURS: their
 *    file and thumbnail are removed, then the row. finishItem and discardItem
 *    refuse items past FINISH_WINDOW_HOURS (< ABANDONED_UPLOAD_HOURS), so
 *    they never act on the same item at once, and by now every upload grant
 *    has long expired. A failed item's files were already removed best
 *    effort, but a still-live grant may have stored them after that, so they
 *    are removed again. Files first, then the row: a storage failure never
 *    leaves objects no row points at. Removing a key that holds nothing
 *    succeeds, so that is not a failure.
 * 2. Batches still `open` after ABANDONED_UPLOAD_HOURS: the uploader never
 *    finished them. Each is closed through `closeBatch`, the same move
 *    `finishBatch` makes, so a late finish and this cleanup never both act on
 *    it. A batch this run closed that has no items left is deleted (its items
 *    reference it, so it can only go once it is empty).
 *
 * One row's failure must not abort the run: it is caught, logged, counted
 * in `failed`, and left for tomorrow's run where it can be retried. Storage
 * is reached only when there is something to remove.
 */
export async function cleanupAbandonedGalleryUploads(deps: {
  payload: Payload;
  storage: ObjectStorageSource;
  now?: () => Date;
  warn?: (message: string, detail: unknown) => void;
}): Promise<{ removed: number; failed: number; batchesClosed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(
    now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const warnIfFull = (count: number, what: string) => {
    if (count >= CLEANUP_PAGE_SIZE) {
      (deps.warn ?? console.warn)(
        `[gallery-uploads-cleanup] page full; more abandoned ${what} may remain`,
        { pageSize: CLEANUP_PAGE_SIZE },
      );
    }
  };

  const { docs: items } = await deps.payload.find({
    collection: "gallery-items",
    where: {
      and: [
        { status: { in: ["uploading", "failed"] } },
        { createdAt: { less_than: cutoff } },
      ],
    },
    sort: "createdAt",
    limit: CLEANUP_PAGE_SIZE,
    depth: 0,
  });
  warnIfFull(items.length, "items");

  let storage: ObjectStorage | null = null;
  let removed = 0;
  let failed = 0;
  for (const item of items) {
    try {
      storage ??= deps.storage();
      await storage.remove(itemFileKeys(item));
      await deps.payload.delete({ collection: "gallery-items", id: item.id });
      removed++;
    } catch (error) {
      failed++;
      console.error(
        "[gallery-uploads-cleanup] removing an abandoned item failed",
        { itemId: item.id, error },
      );
    }
  }

  // After the items, so a batch whose items were all abandoned is empty now.
  const { docs: batches } = await deps.payload.find({
    collection: "gallery-batches",
    where: {
      and: [
        { status: { equals: "open" } },
        { createdAt: { less_than: cutoff } },
      ],
    },
    sort: "createdAt",
    limit: CLEANUP_PAGE_SIZE,
    depth: 0,
  });
  warnIfFull(batches.length, "batches");

  let batchesClosed = 0;
  for (const batch of batches) {
    try {
      // Slice 2 passes the feed announcement here, as finishBatch does.
      const { closed } = await closeBatch(deps, batch, {
        context: "cleanup",
      });
      if (!closed) continue;
      batchesClosed++;
      const { totalDocs } = await deps.payload.count({
        collection: "gallery-items",
        where: { batch: { equals: batch.id } },
      });
      if (totalDocs === 0) {
        await deps.payload.delete({
          collection: "gallery-batches",
          id: batch.id,
        });
      }
    } catch (error) {
      failed++;
      console.error(
        "[gallery-uploads-cleanup] closing an abandoned batch failed",
        { batchId: batch.id, error },
      );
    }
  }
  return { removed, failed, batchesClosed };
}
