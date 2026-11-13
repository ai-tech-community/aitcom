import type { db } from "@/server/db";
import type { ObjectStorageSource } from "@/server/media/object-storage";
import type { getPayloadClient } from "@/server/payload";

export type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * What the gallery service needs from the outside world. Injected so every
 * rule is unit-tested with fakes; the gallery router passes the real ones.
 */
export type GalleryDeps = {
  payload: Payload;
  db: typeof db;
  storage: ObjectStorageSource;
  now?: () => Date;
  /** Names an item's files. Always server-made, never from the client. */
  newUploadId?: () => string;
  log?: (message: string, detail: unknown) => void;
};

export function nowOf(deps: Pick<GalleryDeps, "now">): Date {
  return deps.now?.() ?? new Date();
}
