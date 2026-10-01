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
} from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";

import { loadPostForMediaEdit, writePostMedia } from "./post-media";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type VideoPostDeps = {
  payload: Payload;
  storage: VideoStorage;
  now?: () => Date;
  newUploadId?: () => string;
  log?: (message: string, detail: unknown) => void;
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

type VideoGrant = {
  id: number;
  uploadId: string;
  userId: string;
  communityId: string;
  visibility: VideoVisibility;
  createdAt: string;
};

type UploadedVideo = {
  durationSeconds: number;
  width: number;
  height: number;
};

/**
 * The caller's open upload grant for this community, and where its files
 * are stored. Anything else (someone else's, another community's, already
 * finished, unknown) is the same "expired" answer.
 */
async function openGrant(
  deps: VideoPostDeps,
  input: { userId: string; communityId: string; uploadId: string },
): Promise<{ grant: VideoGrant; keys: { video: string; thumbnail: string } }> {
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
  const keys = videoObjectKeys({
    visibility: grant.visibility,
    communityId: grant.communityId,
    uploadId: grant.uploadId,
  });
  return { grant, keys };
}

/**
 * Trusts nothing from the client: inside the finish window, both stored
 * objects must exist with the right type and size, and the client's size
 * and length must be sane (they are kept for layout only). A bad upload is
 * removed with its grant. Returns the post's `video` fields.
 */
async function verifiedVideo(
  deps: VideoPostDeps,
  grant: VideoGrant,
  keys: { video: string; thumbnail: string },
  input: UploadedVideo,
  now: Date,
  context: string,
) {
  const finishCutoff = new Date(
    now.getTime() - FINISH_WINDOW_HOURS * 60 * 60 * 1000,
  );
  if (new Date(grant.createdAt) < finishCutoff) {
    // Past the finish window: the daily cleanup may already be acting on
    // this grant, so don't touch storage or the grant here either.
    throw new TRPCError({ code: "NOT_FOUND", message: UPLOAD_EXPIRED });
  }
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
    const badKeys = [keys.video, keys.thumbnail];
    try {
      await deps.storage.remove(badKeys);
    } catch (error) {
      // The member still gets the plain answer; the daily cleanup never sees
      // these files once the grant is gone, so the log is the only trace.
      (deps.log ?? console.error)(`[${context}] removing a bad upload failed`, {
        uploadId: grant.uploadId,
        keys: badKeys,
        error,
      });
    }
    await deps.payload.delete({ collection: "video-uploads", id: grant.id });
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The video didn't upload correctly. Please try again.",
    });
  }
  return {
    key: keys.video,
    thumbnailKey: keys.thumbnail,
    storage: storageClassFor(grant.visibility),
    durationSeconds: Math.round(input.durationSeconds * 10) / 10,
    width: Math.round(input.width),
    height: Math.round(input.height),
    bytes: video.bytes,
  };
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
  } & UploadedVideo,
): Promise<{ id: number }> {
  const { grant, keys } = await openGrant(deps, input);
  const now = deps.now?.() ?? new Date();
  // A retry after a finish that created the post but crashed before closing
  // the grant: close it now and hand back the same post.
  const { docs: existingPosts } = await deps.payload.find({
    collection: "feed-posts",
    where: {
      and: [
        { "video.key": { equals: keys.video } },
        { authorId: { equals: input.userId } },
        { isDeleted: { not_equals: true } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  const existingPost = existingPosts[0];
  if (existingPost) {
    await markGrantFinished(deps, grant.id, now);
    return { id: existingPost.id };
  }
  const video = await verifiedVideo(
    deps,
    grant,
    keys,
    input,
    now,
    "feed.finishVideoPost",
  );
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
        visibility: grant.visibility,
        video,
      },
    });
  } catch (error) {
    // The concurrent request's post owns the files, so leave them alone.
    if (isDuplicateVideoKey(error)) {
      throw new TRPCError({ code: "NOT_FOUND", message: UPLOAD_EXPIRED });
    }
    throw error;
  }
  await markGrantFinished(deps, grant.id, now);
  return { id: post.id };
}

/**
 * Puts a finished upload on the author's existing post, replacing its image
 * or video, with the edited caption. Same checks as `finishVideoPost`. The
 * post keeps its visibility (it is fixed after posting), so the upload must
 * have been granted for that same visibility. The old video's files are
 * removed before the grant closes, so a retry after a failed close finds
 * nothing left to clean. Safe to retry: a post that already carries this
 * upload just closes the grant.
 */
export async function replacePostVideo(
  deps: VideoPostDeps,
  input: {
    userId: string;
    communityId: string;
    postId: number;
    uploadId: string;
    caption: string;
  } & UploadedVideo,
): Promise<{ id: number }> {
  const post = await loadPostForMediaEdit(deps.payload, input);
  const { grant, keys } = await openGrant(deps, input);
  const now = deps.now?.() ?? new Date();
  if (post.video?.key === keys.video) {
    await markGrantFinished(deps, grant.id, now);
    return { id: post.id };
  }
  if (grant.visibility !== (post.visibility ?? "community")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A post keeps the audience it was posted to.",
    });
  }
  const video = await verifiedVideo(
    deps,
    grant,
    keys,
    input,
    now,
    "feed.replacePostVideo",
  );
  await writePostMedia(
    { ...deps, getStorage: () => deps.storage },
    post,
    {
      content: input.caption,
      imageUrl: null,
      video,
      isEdited: true,
      editedAt: now.toISOString(),
    },
    "feed.replacePostVideo",
  );
  await markGrantFinished(deps, grant.id, now);
  return { id: post.id };
}

async function markGrantFinished(
  deps: VideoPostDeps,
  grantId: number,
  now: Date,
): Promise<void> {
  await deps.payload.update({
    collection: "video-uploads",
    id: grantId,
    data: { finishedAt: now.toISOString() },
  });
}
