import { ABANDONED_UPLOAD_HOURS } from "@/lib/video-rules";
import type {
  ObjectStorage,
  ObjectStorageSource,
} from "@/server/media/object-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/** Uploads handled per run; the oldest go first, the rest wait a day. */
const CLEANUP_PAGE_SIZE = 200;

/**
 * Daily sweep for classroom file uploads older than ABANDONED_UPLOAD_HOURS
 * that never became ready (spec 2026-09-27 §5.2 step 5):
 *
 * - `uploading`: nobody finished them. finishFileUpload refuses uploads older
 *   than FINISH_WINDOW_HOURS (< ABANDONED_UPLOAD_HOURS), so a finish and this
 *   sweep never act on the same upload at once.
 * - `failed`, whatever the reason (cancelled, deleted, a stored file that did
 *   not match): kept as records so a live grant keeps counting against the
 *   allowance (media-allowance.ts); by now every grant has long expired.
 *
 * For each, the object at its key is removed first, then the record. The
 * object may exist even for a failed record: the browser can finish storing
 * it through a still-live grant after the record was marked failed. Removing
 * a key that holds nothing succeeds (S3 DeleteObjects does not report missing
 * keys), so that is not a failure. Removing the object before the record
 * means a storage failure never leaves an object no record points at.
 *
 * One upload's failure must not abort the run: it's caught, logged, counted,
 * and the record is left for tomorrow's run to retry. Storage is reached only
 * when there is something to remove.
 */
export async function cleanupAbandonedMaterialUploads(deps: {
  payload: Payload;
  storage: ObjectStorageSource;
  now?: () => Date;
  warn?: (message: string, detail: unknown) => void;
}): Promise<{ removed: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(
    now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000,
  );
  const { docs } = await deps.payload.find({
    collection: "hosted-materials",
    where: {
      and: [
        { status: { in: ["uploading", "failed"] } },
        { createdAt: { less_than: cutoff.toISOString() } },
      ],
    },
    sort: "createdAt",
    limit: CLEANUP_PAGE_SIZE,
    depth: 0,
  });
  if (docs.length >= CLEANUP_PAGE_SIZE) {
    (deps.warn ?? console.warn)(
      "[material-uploads-cleanup] page full; more abandoned uploads may remain",
      { pageSize: CLEANUP_PAGE_SIZE },
    );
  }

  let storage: ObjectStorage | null = null;
  let removed = 0;
  let failed = 0;
  for (const material of docs) {
    try {
      storage ??= deps.storage();
      await storage.remove([material.storageKey]);
      await deps.payload.delete({
        collection: "hosted-materials",
        id: material.id,
      });
      removed++;
    } catch (error) {
      failed++;
      console.error("[material-uploads-cleanup] failed", {
        materialId: material.id,
        error,
      });
    }
  }
  return { removed, failed };
}
