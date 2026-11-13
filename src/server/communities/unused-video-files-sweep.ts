import {
  ABANDONED_UPLOAD_HOURS,
  FINISH_WINDOW_HOURS,
  VIDEO_KEY_PREFIXES,
  videoObjectKeys,
} from "@/lib/video-rules";
import { chunkedRemoval } from "@/server/media/chunked-removal";
import type { ObjectStorage } from "@/server/media/object-storage";
import type { getPayloadClient } from "@/server/payload";

import { videoKeysOf } from "./post-video-files";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * Files younger than this are never swept. An upload can only become a
 * post inside its finish window, and an unfinished grant is the abandoned-
 * upload cleanup's to handle, so a file this old that nothing points at
 * can never be claimed again.
 */
export const UNUSED_VIDEO_MIN_AGE_HOURS = 7 * 24;
if (
  UNUSED_VIDEO_MIN_AGE_HOURS <=
  Math.max(FINISH_WINDOW_HOURS, ABANDONED_UPLOAD_HOURS)
) {
  throw new Error("UNUSED_VIDEO_MIN_AGE_HOURS must outlast every upload");
}

/**
 * Garbage collection by reachability for Reels video files. Removing a
 * post's old files right after a delete, edit or moderation is best-effort
 * and can be lost to a storage failure or a crash between the post write
 * and the removal. This sweep is the safety net: it deletes every video or
 * thumbnail object, old enough, that no live post and no open upload grant
 * points at.
 *
 * The live keys are read before the bucket is listed, and every read error
 * stops the run before anything is deleted. Run it only where this
 * database owns the bucket's contents (`ownsStorageContents`).
 */
export async function sweepUnusedVideoFiles(deps: {
  payload: Payload;
  storage: () => Pick<ObjectStorage, "list" | "remove">;
  now?: () => Date;
  log?: (message: string, detail: unknown) => void;
}): Promise<{ scanned: number; removed: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = now.getTime() - UNUSED_VIDEO_MIN_AGE_HOURS * 60 * 60 * 1000;
  const inUse = await keysInUse(deps.payload);

  const storage = deps.storage();
  const removal = chunkedRemoval(storage, (keys, error) =>
    (deps.log ?? console.error)("[unused-video-files] removal failed", {
      keys,
      error,
    }),
  );
  let scanned = 0;
  for (const prefix of Object.values(VIDEO_KEY_PREFIXES)) {
    for await (const object of storage.list(prefix)) {
      scanned++;
      if (object.lastModified.getTime() >= cutoff) continue;
      if (inUse.has(object.key)) continue;
      await removal.add(object.key);
    }
  }
  return { scanned, ...(await removal.finish()) };
}

/** Every key a live post or an open upload grant points at. */
async function keysInUse(payload: Payload): Promise<Set<string>> {
  const inUse = new Set<string>();
  const { docs: posts } = await payload.find({
    collection: "feed-posts",
    where: {
      and: [
        { "video.key": { exists: true } },
        {
          or: [
            { isDeleted: { equals: false } },
            { isDeleted: { exists: false } },
          ],
        },
      ],
    },
    select: { video: true },
    pagination: false,
    depth: 0,
  });
  for (const post of posts) {
    for (const key of videoKeysOf(post)) inUse.add(key);
  }
  const { docs: grants } = await payload.find({
    collection: "video-uploads",
    where: { finishedAt: { exists: false } },
    pagination: false,
    depth: 0,
  });
  for (const grant of grants) {
    try {
      const keys = videoObjectKeys(grant);
      inUse.add(keys.video);
      inUse.add(keys.thumbnail);
    } catch (error) {
      // A grant whose ids are unsafe has no files under our folders to
      // protect; it must not stop the sweep.
      console.warn("[unused-video-files] skipped an unreadable grant", {
        uploadId: grant.uploadId,
        error,
      });
    }
  }
  return inUse;
}
