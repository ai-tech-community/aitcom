import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { communities, communityMemberships, user } from "@/server/db/schema";
import type { getPayloadClient } from "@/server/payload";
import type { FeedPost } from "@/payload-types";
import type { CommunityRole } from "@/server/communities/role-utils";
import type { VideoStorageSource } from "@/server/media/video-storage";
import {
  canViewPost,
  feedViewerFor,
  OUTSIDE_VIEWER,
  type FeedViewer,
} from "@/server/communities/post-visibility";

type Database = typeof Db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

export type FeedMemberRole = CommunityRole;

/**
 * The community behind a feed, for an active member only. Feeds are
 * members-only: anyone else gets FORBIDDEN, an unknown slug NOT_FOUND.
 */
export async function requireActiveFeedMember(
  database: Database,
  communitySlug: string,
  userId: string,
): Promise<{
  id: string;
  slug: string;
  role: FeedMemberRole;
  feedPostPolicy: "all_members" | "admins_only";
}> {
  const community = await database.query.communities.findFirst({
    where: and(
      eq(communities.slug, communitySlug),
      isNull(communities.deletedAt),
    ),
    columns: { id: true, slug: true, feedPostPolicy: true },
  });
  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  const membership = await database.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, community.id),
      eq(communityMemberships.userId, userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { id: true, role: true },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Must be a community member to view the feed",
    });
  }
  return {
    id: community.id,
    slug: community.slug,
    role: membership.role as FeedMemberRole,
    feedPostPolicy: community.feedPostPolicy ?? "all_members",
  };
}

/**
 * One feed post, checked against the shared visibility rule for the person
 * looking (a member, or an agent's owner; null for an unclaimed agent).
 *
 * - A missing or deleted post is NOT_FOUND.
 * - With `requireMembership` (liking, commenting), someone who isn't an
 *   active member of the post's community is FORBIDDEN, as before.
 * - A community post the viewer may not see (hidden, or community-only for an
 *   outsider) is NOT_FOUND, so its existence doesn't leak.
 * - Hub-wide posts (no community) have no visibility rule to apply.
 */
export async function requireViewablePost(
  database: Database,
  payload: Payload,
  postId: number,
  userId: string | null,
  options: { requireMembership?: boolean } = {},
): Promise<{
  post: FeedPost;
  membership: { role: string } | null;
  viewer: FeedViewer;
}> {
  const post = await payload
    .findByID({ collection: "feed-posts", id: postId, depth: 0 })
    .catch(() => null);
  if (!post || post.isDeleted) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
  }
  const membership =
    userId && post.communityId
      ? ((await database.query.communityMemberships.findFirst({
          where: and(
            eq(communityMemberships.communityId, post.communityId),
            eq(communityMemberships.userId, userId),
            eq(communityMemberships.status, "active"),
          ),
          columns: { role: true },
        })) ?? null)
      : null;
  if (options.requireMembership && !membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Must be an active community member",
    });
  }
  const viewer = userId ? feedViewerFor(userId, membership) : OUTSIDE_VIEWER;
  if (post.communityId && !canViewPost(post, viewer)) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Post not found" });
  }
  return { post, membership, viewer };
}

export function canPostToFeed(
  policy: "all_members" | "admins_only",
  role: FeedMemberRole,
): boolean {
  if (policy === "all_members") return true;
  return role === "owner" || role === "admin" || role === "moderator";
}

/** An active member who may post under the community's feed policy. */
export async function requireFeedPoster(
  database: Database,
  communitySlug: string,
  userId: string,
) {
  const community = await requireActiveFeedMember(
    database,
    communitySlug,
    userId,
  );
  if (!canPostToFeed(community.feedPostPolicy, community.role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return community;
}

/** What a client sees of a post's video: playback links, never storage keys. */
export type FeedVideoView = {
  url: string;
  thumbnailUrl: string;
  durationSeconds: number;
  width: number;
  height: number;
  visibility: "community" | "public";
};

export type FeedPostView = Omit<FeedPost, "video"> & {
  authorImage: string | null;
  hasLiked: boolean;
  video: FeedVideoView | null;
};

async function videoView(
  post: FeedPost,
  storage: VideoStorageSource,
): Promise<FeedVideoView | null> {
  const video = post.video;
  if (!video?.key || !video.thumbnailKey || !video.storage) return null;
  // Reached only for a real video, so text-only feeds never need S3.
  const videoStorage = storage();
  const [url, thumbnailUrl] = await Promise.all([
    videoStorage.playbackUrl(video.key, video.storage),
    videoStorage.playbackUrl(video.thumbnailKey, video.storage),
  ]);
  return {
    url,
    thumbnailUrl,
    durationSeconds: video.durationSeconds ?? 0,
    width: video.width ?? 0,
    height: video.height ?? 0,
    visibility: post.visibility === "public" ? "public" : "community",
  };
}

/** Author photos for a set of user ids, in one query. */
export async function loadUserImages(
  database: Database,
  userIds: readonly string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const images = new Map<string, string | null>();
  if (ids.length === 0) return images;
  const rows = await database
    .select({ id: user.id, image: user.image })
    .from(user)
    .where(inArray(user.id, ids));
  for (const row of rows) images.set(row.id, row.image);
  return images;
}

/**
 * Adds the author photo, whether the viewer liked each post, and playback
 * links for a post's video (the raw storage keys never leave the server).
 */
export async function decorateFeedPosts(
  database: Database,
  payload: Payload,
  posts: readonly FeedPost[],
  viewerId: string | null | undefined,
  storage: VideoStorageSource,
): Promise<FeedPostView[]> {
  if (posts.length === 0) return [];
  const images = await loadUserImages(
    database,
    posts.map((post) => post.authorId),
  );
  let liked = new Set<number>();
  if (viewerId) {
    const postIds = posts.map((post) => post.id);
    const { docs } = await payload.find({
      collection: "feed-likes",
      where: {
        and: [{ userId: { equals: viewerId } }, { post: { in: postIds } }],
      },
      limit: postIds.length,
      depth: 0,
    });
    liked = new Set(
      docs.map((like) =>
        typeof like.post === "object"
          ? (like.post as { id: number }).id
          : like.post,
      ),
    );
  }
  return Promise.all(
    posts.map(async (post) => ({
      ...post,
      authorImage: images.get(post.authorId) ?? null,
      hasLiked: liked.has(post.id),
      video: await videoView(post, storage),
    })),
  );
}
