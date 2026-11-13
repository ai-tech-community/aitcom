import { GALLERY_KEY_PREFIXES, isGalleryKey } from "@/lib/gallery-rules";
import { ABANDONED_UPLOAD_HOURS, FINISH_WINDOW_HOURS } from "@/lib/video-rules";
import { chunkedRemoval } from "@/server/media/chunked-removal";
import type { ObjectStorage } from "@/server/media/object-storage";

import type { Payload } from "./deps";
import { itemFileKeys } from "./item-files";

/**
 * Files younger than this are never swept. A file is only ever written
 * through an item's grant, inside its finish window, and an item that never
 * finished is the abandoned-upload cleanup's to handle, so a file this old
 * that no item points at can never be claimed again.
 */
export const UNUSED_GALLERY_MIN_AGE_HOURS = 7 * 24;
if (
  UNUSED_GALLERY_MIN_AGE_HOURS <=
  Math.max(FINISH_WINDOW_HOURS, ABANDONED_UPLOAD_HOURS)
) {
  throw new Error("UNUSED_GALLERY_MIN_AGE_HOURS must outlast every upload");
}

/** Gallery item rows read per query while collecting the keys in use. */
const IN_USE_PAGE_SIZE = 1000;

/**
 * Garbage collection by reachability for gallery files (spec 2026-11-13,
 * Cleanup; ADR-0049), in the style of the Reels sweep
 * (`unused-video-files-sweep.ts`). Removing an item's files on delete or on
 * a failed upload is best effort; this sweep is the safety net. It lists
 * both gallery folders and removes every object, older than seven days,
 * that no `gallery-items` row points at — whatever that row's status, so an
 * upload in progress or a ready item always keeps its files. A key not
 * shaped exactly like a gallery key (`isGalleryKey`) is never removed,
 * whatever the listing returns.
 *
 * The keys in use are read before the bucket is listed, and every read error
 * stops the run before anything is deleted. Run it only where this
 * database owns the bucket's contents (`ownsStorageContents`).
 */
export async function sweepUnusedGalleryFiles(deps: {
  payload: Payload;
  storage: () => Pick<ObjectStorage, "list" | "remove">;
  now?: () => Date;
  log?: (message: string, detail: unknown) => void;
}): Promise<{ scanned: number; removed: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = now.getTime() - UNUSED_GALLERY_MIN_AGE_HOURS * 60 * 60 * 1000;
  const inUse = await keysInUse(deps.payload);

  const storage = deps.storage();
  const removal = chunkedRemoval(storage, (keys, error) =>
    (deps.log ?? console.error)("[unused-gallery-files] removal failed", {
      keys,
      error,
    }),
  );
  let scanned = 0;
  for (const prefix of Object.values(GALLERY_KEY_PREFIXES)) {
    for await (const object of storage.list(prefix)) {
      scanned++;
      if (!isGalleryKey(object.key)) continue;
      if (object.lastModified.getTime() >= cutoff) continue;
      if (inUse.has(object.key)) continue;
      await removal.add(object.key);
    }
  }
  return { scanned, ...(await removal.finish()) };
}

/**
 * The file and thumbnail key of every gallery item, in any status. Read a
 * page at a time by id (keyset), two fields per row: an offset page would
 * skip rows when an item is deleted mid-read, and a skipped row's files
 * would be swept.
 */
async function keysInUse(payload: Payload): Promise<Set<string>> {
  const inUse = new Set<string>();
  let afterId = 0;
  for (;;) {
    const { docs } = await payload.find({
      collection: "gallery-items",
      where: { id: { greater_than: afterId } },
      select: { fileKey: true, thumbnailKey: true },
      sort: "id",
      limit: IN_USE_PAGE_SIZE,
      pagination: false,
      depth: 0,
    });
    for (const item of docs) {
      for (const key of itemFileKeys(item)) inUse.add(key);
    }
    if (docs.length < IN_USE_PAGE_SIZE) return inUse;
    afterId = docs[docs.length - 1]!.id;
  }
}
