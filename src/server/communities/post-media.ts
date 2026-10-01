import { TRPCError } from "@trpc/server";
import type { Where } from "payload";

import type { Gif, GiphyClient } from "@/server/giphy/giphy";
import type { VideoStorageSource } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import type { FeedPost } from "@/payload-types";

import {
  claimFeedImages,
  cleanUpPostImages,
  imageIdsOf,
  type FeedImageChoice,
} from "./feed-images";
import { cleanUpPostVideoFiles } from "./post-video-files";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type PostMediaDeps = {
  payload: Payload;
  getStorage: VideoStorageSource;
  /** Reached only when a GIF is put on a post. */
  getGiphy?: () => GiphyClient;
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

/** A post with no GIF: every field of the `gif` group cleared. */
export const NO_GIF = {
  giphyId: null,
  title: null,
  mp4Url: null,
  stillUrl: null,
  width: null,
  height: null,
} as const;

/** The `gif` group a post stores for a GIF looked up from GIPHY. */
export function gifFields(gif: Gif) {
  return {
    giphyId: gif.giphyId,
    title: gif.title,
    mp4Url: gif.mp4Url,
    stillUrl: gif.stillUrl,
    width: gif.width,
    height: gif.height,
  };
}

/**
 * A GIF to put on a post, looked up by its GIPHY id, so a post only ever
 * stores GIPHY's own media addresses.
 */
export async function lookUpGif(
  getGiphy: (() => GiphyClient) | undefined,
  giphyId: string,
): Promise<Gif> {
  if (!getGiphy) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "GIFs are not available right now.",
    });
  }
  const gif = await getGiphy().byId(giphyId);
  if (!gif) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That GIF is not available. Pick another one.",
    });
  }
  return gif;
}

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
 * Writes new media onto `post` and then removes the video files and the
 * pictures it no longer points at. The write only lands while the post is
 * exactly as it was read (same `updatedAt`, still live and unhidden), so
 * two edits racing on one post cannot both drop the same files and orphan
 * the winner's: the loser gets a CONFLICT and nothing changes.
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
      { updatedAt: { equals: post.updatedAt } },
      { isDeleted: { not_equals: true } },
      { hiddenAt: { exists: false } },
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
  if (data.images !== undefined) {
    await cleanUpPostImages(deps.payload, post, imageIdsOf(data), {
      context,
      log: deps.log,
    });
  }
}

/** What a post's media becomes, other than a new video. */
export type PostMediaChange =
  | { kind: "none" }
  | { kind: "images"; images: FeedImageChoice[] }
  | { kind: "gif"; giphyId: string };

/**
 * Sets a post's text and its media (up to 4 pictures, a GIF, or none) in
 * place of what it carried. Pictures must be the author's own feed post
 * images, not on another post; their descriptions are saved with them. A
 * GIF is looked up on GIPHY by its id. A post holds pictures, a video or a
 * GIF, never two of them, so the others go; and since only video posts
 * may be public, a public post that loses its video becomes
 * community-only. Putting a new video on a post is `replacePostVideo`,
 * which needs a checked upload.
 */
export async function setPostMedia(
  deps: PostMediaDeps,
  input: {
    postId: number;
    userId: string;
    communityId: string;
    content: string;
    media: PostMediaChange;
  },
): Promise<void> {
  const post = await loadPostForMediaEdit(deps.payload, input);
  const { media } = input;
  const images =
    media.kind === "images"
      ? await claimFeedImages(deps.payload, {
          images: media.images,
          userId: input.userId,
          postId: post.id,
        })
      : [];
  const gif =
    media.kind === "gif" ? await lookUpGif(deps.getGiphy, media.giphyId) : null;
  const now = deps.now?.() ?? new Date();
  await writePostMedia(
    deps,
    post,
    {
      content: input.content,
      images: images.map((image) => image.id),
      // A legacy URL-only picture has no link for the hook to clear.
      ...(images.length > 0 ? {} : { imageUrl: null }),
      gif: gif ? gifFields(gif) : NO_GIF,
      ...(post.video?.key
        ? { video: NO_VIDEO, visibility: "community" as const }
        : {}),
      isEdited: true,
      editedAt: now.toISOString(),
    },
    "feed.editPost",
  );
}
