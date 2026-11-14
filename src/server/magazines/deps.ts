import type { db } from "@/server/db";
import type { ObjectStorageSource } from "@/server/media/object-storage";
import type { getPayloadClient } from "@/server/payload";

/** The Payload Local API client every magazine module reads and writes with. */
export type PayloadClient = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * What a magazine service needs from the outside world. `storage` signs
 * links to stored files (gallery items); left out, the app's object storage
 * is used, reached only when an item needs a link.
 */
export type Deps = {
  db: typeof db;
  payload: PayloadClient;
  storage?: ObjectStorageSource;
};
