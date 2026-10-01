import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import type { VideoStorageSource } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import type { FeedPost } from "@/payload-types";

import { cleanUpPostVideoFiles } from "./post-video-files";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type PostMediaDeps = {
  payload: Payload;
  getStorage: VideoStorageSource;
  now?: () => Date;
  log?: (message: string, detail: unknown) => void;
};

/** A post with no video: every field of the `video` group cleared. */
const NO_VIDEO = {
  key: null,
  thumbnailKey: null,
  storage: null,
  durationSeconds: null,
  width: null,
  height: null,
  bytes: null,
} as const;

/**
 * The author's live post in this community, ready to have its image or
 * video changed. A hidden post is waiting for a moderator, who must see
 * the media that was reported, so its media stays as it is until then.
 */
export async function loadPostForMediaEdit(
  payload: Payload,
  input: { postId: number; userId: string; communityId: string },
): Promise<FeedPost> {
  const post = await payload.findByID({
    collection: "feed-posts",
    id: input.postId,
    depth: 0,
    disableErrors: true,
  });
  if (!post || post.isDeleted || post.communityId !== input.communityId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (post.authorId !== input.userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  if (post.hiddenAt) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This post is being reviewed. You can change its picture or video once a moderator has looked at it.",
    });
  }
  return post;
}

/**
 * Writes new media onto `post` and then removes the video files it no
 * longer points at. The write only lands while the post still carries the
 * video it was read with (and is still live and unhidden), so two edits
 * racing on one post cannot both drop the same files and orphan the
 * winner's: the loser gets a CONFLICT and nothing changes.
 */
export async function writePostMedia(
  deps: PostMediaDeps,
  post: FeedPost,
  data: Partial<FeedPost>,
  context: string,
): Promise<void> {
  const oldKey = post.video?.key ?? null;
  const unchangedSinceRead: Where = {
    and: [
      { id: { equals: post.id } },
      { isDeleted: { not_equals: true } },
      { hiddenAt: { exists: false } },
      oldKey
        ? { "video.key": { equals: oldKey } }
        : { "video.key": { exists: false } },
    ],
  };
  const { docs } = await deps.payload.update({
    collection: "feed-posts",
    where: unchangedSinceRead,
    data,
    depth: 0,
  });
  if (docs.length === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This post was changed somewhere else. Reload and try again.",
    });
  }
  const newKey = data.video === undefined ? oldKey : (data.video?.key ?? null);
  if (oldKey && oldKey !== newKey) {
    await cleanUpPostVideoFiles(deps.getStorage, post, {
      context,
      log: deps.log,
    });
  }
}

/**
 * Sets a post's text and its image, or no media at all, in place of what
 * it carried. A post holds one image or one video, never both, so any
 * video goes; and since only video posts may be public, a public post
 * that loses its video becomes community-only. Putting a new video on a
 * post is `replacePostVideo`, which needs a checked upload.
 */
export async function setPostImage(
  deps: PostMediaDeps,
  input: {
    postId: number;
    userId: string;
    communityId: string;
    content: string;
    imageUrl: string | null;
  },
): Promise<void> {
  const post = await loadPostForMediaEdit(deps.payload, input);
  const now = deps.now?.() ?? new Date();
  await writePostMedia(
    deps,
    post,
    {
      content: input.content,
      imageUrl: input.imageUrl,
      ...(post.video?.key
        ? { video: NO_VIDEO, visibility: "community" as const }
        : {}),
      isEdited: true,
      editedAt: now.toISOString(),
    },
    "feed.editPost",
  );
}
