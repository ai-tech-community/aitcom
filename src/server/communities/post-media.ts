import { TRPCError } from "@trpc/server";
import { sql } from "@payloadcms/db-postgres";

import type { Gif, GiphyClient } from "@/server/giphy/giphy";
import type { VideoStorageSource } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import type { FeedPost } from "@/payload-types";
import type { PostMention } from "@/lib/post-mentions";
import type { PollChoice } from "@/lib/poll-rules";
import { NEEDS_TEXT_MESSAGE } from "@/lib/feed-post-rules";

import {
  claimFeedImages,
  cleanUpPostImages,
  imageIdsOf,
  type FeedImageChoice,
} from "./feed-images";
import { cleanUpPostVideoFiles } from "./post-video-files";
import {
  hasPoll,
  noPoll,
  pollFields,
  pollOptionIds,
  removeStaleVotes,
} from "./post-polls";

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
export const NO_VIDEO = {
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
 * Writes new media onto `post` and then removes the video files, the
 * pictures and the poll votes it no longer points at. The post is first claimed in one
 * statement: its `updatedAt` moves on only while it is exactly as it was
 * read (and still live and unhidden), so of two edits racing on one post
 * only one gets through; the other gets a CONFLICT and nothing changes.
 * Counters are written column by column (feed-post-counters), so a like
 * never re-saves the post over an edit.
 */
export async function writePostMedia(
  deps: PostMediaDeps,
  post: FeedPost,
  data: Partial<FeedPost>,
  context: string,
): Promise<void> {
  const oldKey = post.video?.key ?? null;
  const { rows } = await deps.payload.db.drizzle.execute(sql`
    UPDATE "feed_posts" SET "updated_at" = now()
    WHERE "id" = ${post.id}
      AND "updated_at" = ${post.updatedAt}::timestamptz
      AND "is_deleted" IS DISTINCT FROM true
      AND "hidden_at" IS NULL
    RETURNING "id"
  `);
  if (rows.length === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This post was changed somewhere else. Reload and try again.",
    });
  }
  const saved = await deps.payload.update({
    collection: "feed-posts",
    id: post.id,
    data,
    depth: 0,
  });
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
  if (data.poll !== undefined && hasPoll(post)) {
    await removeStaleVotes(deps.payload, post.id, pollOptionIds(saved));
  }
}

/**
 * Refuses a post that would have neither words nor a picture, GIF or
 * video (`carriesMedia`); a poll needs its question.
 */
export function requireTextOrMedia(content: string, carriesMedia: boolean) {
  if (!content.trim() && !carriesMedia) {
    throw new TRPCError({ code: "BAD_REQUEST", message: NEEDS_TEXT_MESSAGE });
  }
}

/** Changes an edit makes besides text and media. */
export type PostDetailsChange = {
  /** Already checked against the community (`resolvePostTopic`). */
  topicSlug?: string;
  /** Take the link preview off the post, or put it back. */
  linkPreviewHidden?: boolean;
};

/** The fields a details change writes onto `post`. */
export function postDetailsUpdate(
  post: FeedPost,
  details: PostDetailsChange,
): Partial<FeedPost> {
  return {
    ...(details.topicSlug === undefined
      ? {}
      : { topicSlug: details.topicSlug }),
    // Only a post with a previewed link has a preview to hide.
    ...(details.linkPreviewHidden === undefined || !post.linkPreview?.url
      ? {}
      : {
          linkPreview: {
            ...post.linkPreview,
            hidden: details.linkPreviewHidden,
          },
        }),
  };
}

/** What a post's media becomes, other than a new video. */
export type PostMediaChange =
  | { kind: "none" }
  | { kind: "images"; images: FeedImageChoice[] }
  | { kind: "gif"; giphyId: string }
  | { kind: "poll"; poll: PollChoice };

/**
 * Sets a post's text and its media (up to 4 pictures, a GIF, a poll, or
 * none) in place of what it carried. Pictures must be the author's own feed
 * post images, not on another post; their descriptions are saved with them.
 * A GIF is looked up on GIPHY by its id. A post holds pictures, a video, a
 * GIF or a poll, never two of them, so the others go; and since only video
 * posts may be public, a public post that loses its video becomes
 * community-only. Taking a poll off, or changing its answers, removes the
 * votes for answers it no longer has. Putting a new video on a post is `replacePostVideo`, which needs a
 * checked upload.
 */
export async function setPostMedia(
  deps: PostMediaDeps,
  input: {
    postId: number;
    userId: string;
    communityId: string;
    content: string;
    /** New checked mentions (`resolveMentions`); the post's own stay. */
    mentions?: PostMention[];
    media: PostMediaChange;
    details?: PostDetailsChange;
  },
): Promise<void> {
  const post = await loadPostForMediaEdit(deps.payload, input);
  const { media } = input;
  requireTextOrMedia(
    input.content,
    media.kind === "images" || media.kind === "gif",
  );
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
  // A changed poll may keep its end (`days` null); votes for answers it no
  // longer has go with them (the editor warns before Save).
  const poll =
    media.kind === "poll"
      ? pollFields(media.poll, now, post.poll?.closesAt)
      : noPoll();
  await writePostMedia(
    deps,
    post,
    {
      content: input.content,
      ...(input.mentions ? { mentions: input.mentions } : {}),
      ...postDetailsUpdate(post, input.details ?? {}),
      images: images.map((image) => image.id),
      // A legacy picture (URL-only, or in the deprecated single field) has
      // no list entry for the hook to clear.
      ...(images.length > 0 ? {} : { imageUrl: null, image: null }),
      gif: gif ? gifFields(gif) : NO_GIF,
      ...(media.kind === "poll" || hasPoll(post) ? { poll } : {}),
      ...(post.video?.key
        ? { video: NO_VIDEO, visibility: "community" as const }
        : {}),
      isEdited: true,
      editedAt: now.toISOString(),
    },
    "feed.editPost",
  );
}
