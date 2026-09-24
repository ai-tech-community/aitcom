import type { Where } from "payload";

import type { FeedPost } from "@/payload-types";
import type { db as Db } from "@/server/db";
import type { VideoStorageSource } from "@/server/media/video-storage";
import type { getPayloadClient } from "@/server/payload";
import { decorateFeedPosts, type FeedPostView } from "./feed-posts";
import {
  canViewPost,
  postVisibilityWhere,
  type FeedViewer,
} from "./post-visibility";

type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type ReelsCursor = { createdAt: string; id: number };

/**
 * Why a deep-linked video isn't shown. "members_only" tells a visitor that
 * joining would reveal it; "unavailable" covers everything else (missing,
 * deleted, hidden after a report, another community, not a video) and
 * never says which, so a hidden post can't be probed.
 */
export type ReelsNotice = "members_only" | "unavailable";

export type ReelsPage = {
  items: FeedPostView[];
  nextCursor: ReelsCursor | null;
  notice: ReelsNotice | null;
};

type DeepLink =
  | { kind: "none" }
  | { kind: "start"; post: FeedPost }
  | { kind: "blocked"; notice: ReelsNotice };

/** The deep-linked post, if the viewer may start the reel there. */
async function resolveDeepLink(
  payload: Payload,
  communityId: string,
  viewer: FeedViewer,
  postId: number,
): Promise<DeepLink> {
  const post: FeedPost | null = await payload
    .findByID({ collection: "feed-posts", id: postId, depth: 0 })
    .catch(() => null);
  if (post?.communityId !== communityId || !post.video?.key) {
    return { kind: "blocked", notice: "unavailable" };
  }
  if (canViewPost(post, viewer)) return { kind: "start", post };
  // Only a live, unreported community-only video is "members only"; a
  // hidden or deleted one stays "unavailable" to everyone who can't see it.
  const membersOnly =
    !viewer.isMember &&
    post.visibility !== "public" &&
    !post.hiddenAt &&
    !post.isDeleted;
  return {
    kind: "blocked",
    notice: membersOnly ? "members_only" : "unavailable",
  };
}

/**
 * A community's video posts, newest first, for Reels mode. The viewer's
 * visibility rule filters the list, so visitors get public, non-hidden
 * videos only. A deep link starts the reel at that video when the viewer
 * may see it, and returns a notice instead of the video when not.
 */
export async function listReels(
  deps: { database: typeof Db; payload: Payload; storage: VideoStorageSource },
  input: {
    community: { id: string };
    viewer: FeedViewer;
    cursor: ReelsCursor | null;
    startAtPostId: number | null;
    limit: number;
  },
): Promise<ReelsPage> {
  // A cursor means a later page; the deep link only shapes the first one.
  const link: DeepLink =
    input.startAtPostId !== null && !input.cursor
      ? await resolveDeepLink(
          deps.payload,
          input.community.id,
          input.viewer,
          input.startAtPostId,
        )
      : { kind: "none" };
  if (link.kind === "blocked") {
    return { items: [], nextCursor: null, notice: link.notice };
  }
  const start = link.kind === "start" ? link.post : null;

  const after =
    input.cursor ??
    (start ? { createdAt: start.createdAt, id: start.id } : null);
  const clauses: Where[] = [
    { communityId: { equals: input.community.id } },
    { "video.key": { exists: true } },
    postVisibilityWhere(input.viewer),
  ];
  if (after) {
    clauses.push({
      or: [
        { createdAt: { less_than: after.createdAt } },
        {
          and: [
            { createdAt: { equals: after.createdAt } },
            { id: { less_than: after.id } },
          ],
        },
      ],
    });
  }
  const { docs } = await deps.payload.find({
    collection: "feed-posts",
    where: { and: clauses },
    // id breaks createdAt ties, matching the (createdAt, id) keyset cursor.
    sort: ["-createdAt", "-id"],
    limit: input.limit + 1,
    depth: 0,
  });

  const candidates = start ? [start, ...docs] : docs;
  const hasMore = candidates.length > input.limit;
  const page = candidates.slice(0, input.limit);
  const items = await decorateFeedPosts(
    deps.database,
    deps.payload,
    page,
    input.viewer.userId,
    deps.storage,
  );
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
    notice: null,
  };
}
