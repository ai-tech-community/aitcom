import { isGalleryKey } from "@/lib/gallery-rules";
import type { GalleryItem } from "@/payload-types";
import { objectUrl, type ObjectStorage } from "@/server/media/object-storage";

import type { GalleryDeps } from "./deps";

type ItemFiles = Pick<
  GalleryItem,
  "id" | "storage" | "fileKey" | "thumbnailKey"
>;

/**
 * Links to an item's file and thumbnail: a direct URL for public storage, a
 * signed one for private storage (`objectUrl`, the rule feed videos use too). Call only
 * after the viewer's access to the item was checked: a signed link is the
 * access.
 */
export async function itemFileUrls(
  storage: ObjectStorage,
  item: ItemFiles,
): Promise<{ url: string; thumbnailUrl: string }> {
  const [url, thumbnailUrl] = await Promise.all([
    objectUrl(storage, item.fileKey, item.storage),
    objectUrl(storage, item.thumbnailKey, item.storage),
  ]);
  return { url, thumbnailUrl };
}

/** Every object an item owns: its file and its thumbnail. */
export function itemFileKeys(
  item: Pick<GalleryItem, "fileKey" | "thumbnailKey">,
): [string, string] {
  return [item.fileKey, item.thumbnailKey];
}

/**
 * Removes an item's file and thumbnail: the one way gallery code removes an
 * item's objects. Only gallery keys (`isGalleryKey`) are ever removed; any
 * other key on the row is logged and left alone. Storage is reached only
 * when there is a gallery key to remove, and removing a key that holds
 * nothing succeeds.
 *
 * Best effort by default: a failure is logged, and the unused-files sweep
 * is the net. `onFailure: "throw"` passes it on instead, for a caller that
 * must keep the row when its objects could not be removed.
 */
export async function removeItemFiles(
  deps: Pick<GalleryDeps, "storage" | "log">,
  item: Pick<GalleryItem, "id" | "fileKey" | "thumbnailKey">,
  context: string,
  options: { onFailure?: "log" | "throw" } = {},
): Promise<void> {
  const log = deps.log ?? console.error;
  const keys = itemFileKeys(item);
  const ours = keys.filter(isGalleryKey);
  if (ours.length < keys.length) {
    log(`[gallery.${context}] left a key outside the gallery folders`, {
      itemId: item.id,
      keys: keys.filter((key) => !isGalleryKey(key)),
    });
  }
  if (ours.length === 0) return;
  try {
    await deps.storage().remove(ours);
  } catch (error) {
    if (options.onFailure === "throw") throw error;
    log(`[gallery.${context}] removing an item's objects failed`, {
      itemId: item.id,
      keys: ours,
      error,
    });
  }
}
