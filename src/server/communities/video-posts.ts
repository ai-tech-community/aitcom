import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { ValidationError } from "payload";

import {
  FINISH_WINDOW_HOURS,
  MAX_THUMB_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  THUMB_CONTENT_TYPE,
  VIDEO_CONTENT_TYPE,
  VIDEO_UPLOADS_PER_DAY,
  storageClassFor,
  videoObjectKeys,
  type VideoVisibility,
} from "@/lib/video-rules";
import type {
  PresignedUpload,
  VideoStorage,
  VideoStorageSource,
} from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type VideoPostDeps = {
  payload: Payload;
  storage: VideoStorage;
  now?: () => Date;
  newUploadId?: () => string;
};

type PostVideoFiles = {
  video?: { key?: string | null; thumbnailKey?: string | null } | null;
};

const UPLOAD_EXPIRED = "That upload has expired. Please try again.";

/** Grants one video and one thumbnail upload, within the daily limit. */
export async function issueVideoUpload(
  deps: VideoPostDeps,
  input: { userId: string; communityId: string; visibility: VideoVisibility },
): Promise<{
  uploadId: string;
  video: PresignedUpload;
  thumbnail: PresignedUpload;
}> {
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { totalDocs } = await deps.payload.count({
    collection: "video-uploads",
    where: {
      and: [
        { userId: { equals: input.userId } },
        { createdAt: { greater_than: since } },
      ],
    },
  });
  if (totalDocs >= VIDEO_UPLOADS_PER_DAY) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message:
        "You've posted the most videos allowed for today. Try again tomorrow.",
    });
  }
  const uploadId = deps.newUploadId?.() ?? randomUUID();
  await deps.payload.create({
    collection: "video-uploads",
    data: {
      uploadId,
      userId: input.userId,
      communityId: input.communityId,
      visibility: input.visibility,
    },
  });
  const keys = videoObjectKeys({ ...input, uploadId });
  const [video, thumbnail] = await Promise.all([
    deps.storage.presignUpload({
      key: keys.video,
      contentType: VIDEO_CONTENT_TYPE,
      maxBytes: MAX_VIDEO_BYTES,
    }),
    deps.storage.presignUpload({
      key: keys.thumbnail,
      contentType: THUMB_CONTENT_TYPE,
      maxBytes: MAX_THUMB_BYTES,
    }),
  ]);
  return { uploadId, video, thumbnail };
}

/**
 * True when a feed-posts create failed only because another post already
 * owns this video key: a concurrent finish of the same upload won the race.
 * Payload turns the Postgres unique violation into a ValidationError whose
 * path is the field path, or the column name when the constraint name can't
 * be mapped back.
 */
function isDuplicateVideoKey(error: unknown): boolean {
  if (!(error instanceof ValidationError)) return false;
  const { collection, errors } = error.data;
  return (
    collection === "feed-posts" &&
    errors.length > 0 &&
    errors.every((e) => e.path === "video.key" || e.path === "video_key")
  );
}

/**
 * Turns a finished upload into a post. Trusts nothing from the client for
 * access: the grant must be the caller's and unused, and both stored objects
 * must exist with the right type and size. Size and length from the client
 * are kept for layout only, after a sanity check. Returns the new post's id
 * only, so the storage keys never reach the client.
 */
export async function finishVideoPost(
  deps: VideoPostDeps,
  input: {
    userId: string;
    authorName: string;
    communityId: string;
    uploadId: string;
    caption: string;
    topicSlug: string;
    durationSeconds: number;
    width: number;
    height: number;
  },
): Promise<{ id: number }> {
  const { docs } = await deps.payload.find({
    collection: "video-uploads",
    where: { uploadId: { equals: input.uploadId } },
    limit: 1,
    depth: 0,
  });
  const grant = docs[0];
  if (
    grant?.userId !== input.userId ||
    grant.communityId !== input.communityId ||
    grant.finishedAt
  ) {
    throw new TRPCError({ code: "NOT_FOUND", message: UPLOAD_EXPIRED });
  }
  const now = deps.now?.() ?? new Date();
  const finishCutoff = new Date(
    now.getTime() - FINISH_WINDOW_HOURS * 60 * 60 * 1000,
  );
  if (new Date(grant.createdAt) < finishCutoff) {
    // Past the finish window: the daily cleanup may already be acting on
    // this grant, so don't touch storage or the grant here either.
    throw new TRPCError({ code: "NOT_FOUND", message: UPLOAD_EXPIRED });
  }
  const visibility = grant.visibility;
  const keys = videoObjectKeys({
    visibility,
    communityId: grant.communityId,
    uploadId: grant.uploadId,
  });
  const [video, thumbnail] = await Promise.all([
    deps.storage.inspect(keys.video),
    deps.storage.inspect(keys.thumbnail),
  ]);
  const valid =
    video?.contentType === VIDEO_CONTENT_TYPE &&
    video.bytes > 0 &&
    video.bytes <= MAX_VIDEO_BYTES &&
    thumbnail?.contentType === THUMB_CONTENT_TYPE &&
    thumbnail.bytes > 0 &&
    thumbnail.bytes <= MAX_THUMB_BYTES &&
    input.durationSeconds > 0 &&
    input.durationSeconds <= MAX_VIDEO_SECONDS + 1 &&
    input.width > 0 &&
    input.width <= 4096 &&
    input.height > 0 &&
    input.height <= 4096;
  if (!valid) {
    await deps.storage.remove([keys.video, keys.thumbnail]);
    await deps.payload.delete({ collection: "video-uploads", id: grant.id });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The video didn't upload correctly. Please try again.",
    });
  }
  let post;
  try {
    post = await deps.payload.create({
      collection: "feed-posts",
      data: {
        content: input.caption,
        authorId: input.userId,
        authorName: input.authorName,
        communityId: input.communityId,
        topicSlug: input.topicSlug,
        likeCount: 0,
        commentCount: 0,
        visibility,
        video: {
          key: keys.video,
          thumbnailKey: keys.thumbnail,
          storage: storageClassFor(visibility),
          durationSeconds: Math.round(input.durationSeconds * 10) / 10,
          width: Math.round(input.width),
          height: Math.round(input.height),
          bytes: video.bytes,
        },
      },
    });
  } catch (error) {
    // The concurrent request's post owns the files, so leave them alone.
    if (isDuplicateVideoKey(error)) {
      throw new TRPCError({ code: "NOT_FOUND", message: UPLOAD_EXPIRED });
    }
    throw error;
  }
  await deps.payload.update({
    collection: "video-uploads",
    id: grant.id,
    data: { finishedAt: now.toISOString() },
  });
  return { id: post.id };
}

function videoKeysOf(post: PostVideoFiles): string[] {
  return [post.video?.key, post.video?.thumbnailKey].filter(
    (key): key is string => Boolean(key),
  );
}

/** Deletes a video post's files. Safe to call for posts without a video. */
export async function removePostVideo(
  storage: VideoStorage,
  post: PostVideoFiles,
): Promise<void> {
  const keys = videoKeysOf(post);
  if (keys.length === 0) return;
  await storage.remove(keys);
}

/**
 * Best-effort file cleanup after a post is already soft-deleted. The delete
 * has happened, so a storage failure must not turn it into an error for the
 * user. The abandoned-upload cleanup never covers finished posts, so the log
 * line is the only signal that files were left behind.
 */
export async function cleanUpDeletedPostVideo(
  getStorage: VideoStorageSource,
  post: PostVideoFiles & { id: number },
  log: (message: string, detail: unknown) => void = console.error,
): Promise<void> {
  const keys = videoKeysOf(post);
  if (keys.length === 0) return;
  try {
    await removePostVideo(getStorage(), post);
  } catch (error) {
    log("[feed.deletePost] video cleanup failed", {
      postId: post.id,
      keys,
      error,
    });
  }
}
