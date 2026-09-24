// src/server/communities/video-uploads-cleanup.ts
import { ABANDONED_UPLOAD_HOURS, videoObjectKeys } from "@/lib/video-rules";
import type { VideoStorage } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * Daily sweep for upload grants nobody finished within ABANDONED_UPLOAD_HOURS.
 *
 * A grant can be stale even though its post already exists: finishVideoPost
 * creates the feed-posts row first and only then marks the grant finished, so
 * a crash between those two writes leaves an unfinished grant whose files a
 * post already owns. Deleting those files would break a live post, so each
 * stale grant is checked against feed-posts by its video key first. When a
 * post owns the key, the files are left alone and the grant is just marked
 * finished (not counted as removed). Otherwise the files and the grant are
 * both deleted.
 *
 * One grant's storage failure must not abort the run: it's caught, logged,
 * and the grant is left for tomorrow's run to retry.
 */
export async function cleanupAbandonedUploads(deps: {
  payload: Payload;
  storage: VideoStorage;
  now?: () => Date;
}): Promise<{ removed: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(
    now.getTime() - ABANDONED_UPLOAD_HOURS * 60 * 60 * 1000,
  );
  const { docs } = await deps.payload.find({
    collection: "video-uploads",
    where: {
      and: [
        { finishedAt: { exists: false } },
        { createdAt: { less_than: cutoff.toISOString() } },
      ],
    },
    limit: 200,
    depth: 0,
  });

  let removed = 0;
  let failed = 0;

  for (const grant of docs) {
    try {
      const keys = videoObjectKeys({
        visibility: grant.visibility,
        communityId: grant.communityId,
        uploadId: grant.uploadId,
      });
      const { totalDocs: postExists } = await deps.payload.count({
        collection: "feed-posts",
        where: { "video.key": { equals: keys.video } },
      });
      if (postExists > 0) {
        // A post already owns these files; just close out the grant.
        await deps.payload.update({
          collection: "video-uploads",
          id: grant.id,
          data: { finishedAt: now.toISOString() },
        });
        continue;
      }
      await deps.storage.remove([keys.video, keys.thumbnail]);
      await deps.payload.delete({ collection: "video-uploads", id: grant.id });
      removed++;
    } catch (error) {
      failed++;
      console.error("[video-uploads-cleanup] failed", {
        uploadId: grant.uploadId,
        error,
      });
    }
  }

  return { removed, failed };
}
