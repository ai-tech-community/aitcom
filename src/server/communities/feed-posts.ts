import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNull } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { communities, communityMemberships, user } from "@/server/db/schema";
import type { getPayloadClient } from "@/server/payload";
import type { FeedPost } from "@/payload-types";

type Database = typeof Db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * The community behind a feed, for an active member only. Feeds are
 * members-only: anyone else gets FORBIDDEN, an unknown slug NOT_FOUND.
 */
export async function requireActiveFeedMember(
  database: Database,
  communitySlug: string,
  userId: string,
): Promise<{ id: string; slug: string }> {
  const community = await database.query.communities.findFirst({
    where: and(
      eq(communities.slug, communitySlug),
      isNull(communities.deletedAt),
    ),
    columns: { id: true, slug: true },
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
    columns: { id: true },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Must be a community member to view the feed",
    });
  }
  return community;
}

export type FeedPostView = FeedPost & {
  authorImage: string | null;
  hasLiked: boolean;
};

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

/** Adds the author photo and whether the viewer liked each post. */
export async function decorateFeedPosts(
  database: Database,
  payload: Payload,
  posts: readonly FeedPost[],
  viewerId: string | null | undefined,
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
  return posts.map((post) => ({
    ...post,
    authorImage: images.get(post.authorId) ?? null,
    hasLiked: liked.has(post.id),
  }));
}
