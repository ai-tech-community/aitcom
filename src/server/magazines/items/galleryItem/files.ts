import type { GalleryItem } from "@/payload-types";
import { itemFileUrls } from "@/server/gallery/item-files";
import {
  getObjectStorage,
  objectUrl,
  type ObjectStorage,
  type ObjectStorageSource,
} from "@/server/media/object-storage";

type ItemFiles = Pick<
  GalleryItem,
  "id" | "storage" | "fileKey" | "thumbnailKey"
>;

/**
 * Links for items whose access was already checked for this viewer: a
 * signed link is the access. Made per request, never stored. Storage is
 * reached only when there is an item to link to; without an injected source
 * it is the app's object storage.
 */
async function linkEach<T>(
  source: ObjectStorageSource | undefined,
  items: readonly ItemFiles[],
  link: (storage: ObjectStorage, item: ItemFiles) => Promise<T>,
): Promise<Map<number, T>> {
  if (items.length === 0) return new Map();
  const storage = (source ?? getObjectStorage)();
  return new Map(
    await Promise.all(
      items.map(async (item) => [item.id, await link(storage, item)] as const),
    ),
  );
}

/** Each item's file and thumbnail (`itemFileUrls`), for an issue. */
export function galleryItemFileUrls(
  source: ObjectStorageSource | undefined,
  items: readonly ItemFiles[],
): Promise<Map<number, { url: string; thumbnailUrl: string }>> {
  return linkEach(source, items, itemFileUrls);
}

/** Each item's thumbnail only, for the picker, which shows nothing larger. */
export function galleryItemThumbnailUrls(
  source: ObjectStorageSource | undefined,
  items: readonly ItemFiles[],
): Promise<Map<number, string>> {
  return linkEach(source, items, (storage, item) =>
    objectUrl(storage, item.thumbnailKey, item.storage),
  );
}
