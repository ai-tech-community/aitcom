import { and, inArray, isNull } from "drizzle-orm";
import type { Payload, Where } from "payload";

import {
  activeMemberCommunityIds,
  COMMUNITY_VISIBILITY_COLUMNS,
  hiddenContentCommunityIds,
  viewerCanReadContent,
} from "@/server/communities/content-visibility-queries";
import {
  feedViewerFor,
  OUTSIDE_VIEWER,
  postVisibilityWhere,
} from "@/server/communities/post-visibility";
import type { db } from "@/server/db";
import { communities } from "@/server/db/schema";

const RECENT_POST_LIMIT = 3;
const POST_BATCH_SIZE = 12;

export function profilePostsWhere(
  authorId: string,
  viewerId: string | null,
  memberOf: readonly string[],
  hidden: readonly string[],
): Where {
  const visible = [postVisibilityWhere(OUTSIDE_VIEWER)];
  if (viewerId && memberOf.length > 0) {
    visible.push({
      and: [
        { communityId: { in: [...memberOf] } },
        postVisibilityWhere(feedViewerFor(viewerId, { role: "member" })),
      ],
    });
  }
  return {
    and: [
      { authorId: { equals: authorId } },
      { communityId: { exists: true } },
      { hiddenAt: { exists: false } },
      ...(hidden.length > 0 ? [{ communityId: { not_in: [...hidden] } }] : []),
      { or: visible },
    ],
  };
}

/** A profile excerpt links to the existing community feed. */
export type ProfilePost = {
  id: number;
  content: string;
  createdAt: string;
  community: { slug: string; name: string };
};

export async function loadProfilePosts(
  database: typeof db,
  payload: Pick<Payload, "find">,
  authorId: string,
  viewerId: string | null,
): Promise<ProfilePost[]> {
  const [memberOf, hidden] = await Promise.all([
    viewerId ? activeMemberCommunityIds(database, viewerId) : new Set<string>(),
    hiddenContentCommunityIds(database, viewerId),
  ]);
  const where = profilePostsWhere(authorId, viewerId, [...memberOf], hidden);
  const readable = new Map<string, ProfilePost["community"] | null>();
  const posts: ProfilePost[] = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage && posts.length < RECENT_POST_LIMIT) {
    const result = await payload.find({
      collection: "feed-posts",
      where,
      select: { content: true, communityId: true, createdAt: true },
      sort: ["-createdAt", "-id"],
      limit: POST_BATCH_SIZE,
      page,
      depth: 0,
    });
    const ids = [
      ...new Set(result.docs.map((post) => post.communityId)),
    ].filter((id): id is string => typeof id === "string" && !readable.has(id));
    if (ids.length > 0) {
      for (const id of ids) readable.set(id, null);
      const rows = await database.query.communities.findMany({
        where: and(inArray(communities.id, ids), isNull(communities.deletedAt)),
        columns: { ...COMMUNITY_VISIBILITY_COLUMNS, name: true },
      });
      await Promise.all(
        rows.map(async (community) => {
          if (await viewerCanReadContent(database, community, viewerId)) {
            readable.set(community.id, {
              slug: community.slug,
              name: community.name,
            });
          }
        }),
      );
    }
    for (const post of result.docs) {
      const community = post.communityId && readable.get(post.communityId);
      if (!community) continue;
      posts.push({
        id: post.id,
        content: post.content ?? "",
        createdAt: post.createdAt,
        community,
      });
      if (posts.length === RECENT_POST_LIMIT) break;
    }
    hasNextPage = result.hasNextPage;
    page++;
  }
  return posts;
}
