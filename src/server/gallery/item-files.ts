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

/** Removes an item's file and thumbnail, best effort: the sweep is the net. */
export async function removeItemFiles(
  deps: Pick<GalleryDeps, "storage" | "log">,
  item: ItemFiles,
  context: string,
): Promise<void> {
  try {
    await deps.storage().remove([item.fileKey, item.thumbnailKey]);
  } catch (error) {
    (deps.log ?? console.error)(
      `[gallery.${context}] removing an item's objects failed`,
      {
        itemId: item.id,
        keys: [item.fileKey, item.thumbnailKey],
        error,
      },
    );
  }
}
