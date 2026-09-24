import { and, desc, eq, lt } from "drizzle-orm";
import type { Where } from "payload";

import { MAX_PINS } from "@/lib/feed-sort";
import {
  groupAdjacentJoins,
  mergeActivityPage,
  type ActivityCursor,
  type ActivityEntry,
} from "@/lib/community-activity";
import type { db as Db } from "@/server/db";
import { communityMemberships, memberProfiles, user } from "@/server/db/schema";
import type { getPayloadClient } from "@/server/payload";
import { buildIdeasWhere } from "@/server/api/routers/ideas-filter";
import {
  decorateFeedPosts,
  loadUserImages,
  type FeedPostView,
} from "@/server/communities/feed-posts";
import { forumThreadCommunityWhere } from "@/server/communities/forum-scope";
import { HUB_SLUG } from "@/server/communities/hub";
import {
  postVisibilityWhere,
  type FeedViewer,
} from "@/server/communities/post-visibility";
import type { VideoStorageSource } from "@/server/media/video-storage";

type Database = typeof Db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * Rows fetched per source beyond the page size. Rows sharing the cursor's
 * exact instant are dropped after fetching, so a little headroom keeps a
 * source from coming up short on a page boundary.
 */
const SOURCE_HEADROOM = 5;

export type ActivityThread = {
  id: number;
  slug: string;
  title: string;
  category: string | null;
  authorName: string | null;
  authorImage: string | null;
  replyCount: number;
};

export type ActivityIdea = {
  id: number;
  title: string;
  authorName: string | null;
  authorImage: string | null;
  voteCount: number;
  status: string | null;
};

export type ActivityEvent = {
  id: number;
  slug: string;
  title: string;
  type: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  location: string | null;
};

export type ActivityMember = { id: string; name: string; image: string | null };

export type CommunityFeedItem =
  | { kind: "post"; key: string; at: string; post: FeedPostView }
  | { kind: "thread"; key: string; at: string; thread: ActivityThread }
  | { kind: "idea"; key: string; at: string; idea: ActivityIdea }
  | { kind: "event"; key: string; at: string; event: ActivityEvent }
  | { kind: "joins"; key: string; at: string; members: ActivityMember[] };

export type CommunityActivityPage = {
  /** Pinned posts, first page only; they are left out of the stream. */
  pinned: FeedPostView[];
  items: CommunityFeedItem[];
  nextCursor: ActivityCursor | null;
};

/**
 * One page of a community's activity, read from the content tables (not the
 * activity log, which misses most history). Deleted posts and threads,
 * unpublished events, and inactive memberships never appear.
 */
export async function loadCommunityActivity({
  database,
  payload,
  community,
  viewerId,
  viewer,
  storage,
  cursor,
  limit,
}: {
  database: Database;
  payload: Payload;
  community: { id: string; slug: string };
  viewerId: string;
  /** Who is looking; decides which posts (hidden, community-only) show. */
  viewer: FeedViewer;
  storage: VideoStorageSource;
  cursor: ActivityCursor | null;
  limit: number;
}): Promise<CommunityActivityPage> {
  const visiblePosts = postVisibilityWhere(viewer);
  const perSource = limit + SOURCE_HEADROOM;
  const atOrBefore = cursor ? { less_than_equal: cursor.at } : undefined;
  const withCursor = (clauses: Where[]): Where => ({
    and: atOrBefore ? [...clauses, { createdAt: atOrBefore }] : clauses,
  });

  const [posts, threads, ideas, events, joins, pinnedDocs] = await Promise.all([
    payload.find({
      collection: "feed-posts",
      where: withCursor([
        { communityId: { equals: community.id } },
        { isDeleted: { not_equals: true } },
        { isPinned: { not_equals: true } },
        visiblePosts,
      ]),
      sort: "-createdAt",
      limit: perSource,
      depth: 0,
    }),
    payload.find({
      collection: "forum-threads",
      where: withCursor([
        { isDeleted: { not_equals: true } },
        forumThreadCommunityWhere(community),
      ]),
      sort: "-createdAt",
      limit: perSource,
      depth: 0,
    }),
    payload.find({
      collection: "community-ideas",
      where: withCursor([buildIdeasWhere({ communityId: community.id })]),
      sort: "-createdAt",
      limit: perSource,
      depth: 0,
    }),
    payload.find({
      collection: "events",
      where: withCursor([
        { status: { equals: "published" } },
        { communityId: { equals: community.id } },
      ]),
      sort: "-createdAt",
      limit: perSource,
      draft: false,
      depth: 0,
    }),
    // The Hub counts thousands of members; joins there are noise, not news.
    community.slug === HUB_SLUG
      ? Promise.resolve([])
      : database
          .select({
            userId: communityMemberships.userId,
            joinedAt: communityMemberships.joinedAt,
            displayName: memberProfiles.displayName,
            name: user.name,
            image: user.image,
          })
          .from(communityMemberships)
          .innerJoin(user, eq(communityMemberships.userId, user.id))
          .leftJoin(
            memberProfiles,
            eq(communityMemberships.userId, memberProfiles.userId),
          )
          .where(
            and(
              eq(communityMemberships.communityId, community.id),
              eq(communityMemberships.status, "active"),
              // joinedAt keeps microseconds; the cursor keeps milliseconds.
              // Take the whole cursor millisecond and let the merge's exact
              // (at, key) comparison drop rows already shown.
              cursor
                ? lt(
                    communityMemberships.joinedAt,
                    new Date(Date.parse(cursor.at) + 1),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(communityMemberships.joinedAt))
          .limit(perSource),
    cursor
      ? Promise.resolve(null)
      : payload.find({
          collection: "feed-posts",
          where: {
            and: [
              { communityId: { equals: community.id } },
              { isDeleted: { not_equals: true } },
              { isPinned: { equals: true } },
              visiblePosts,
            ],
          },
          sort: "-createdAt",
          limit: MAX_PINS,
          depth: 0,
        }),
  ]);

  const { entries, nextCursor } = mergeActivityPage(
    [
      posts.docs.map(
        (doc): ActivityEntry => ({
          kind: "post",
          id: String(doc.id),
          at: doc.createdAt,
          data: doc,
        }),
      ),
      threads.docs.map(
        (doc): ActivityEntry => ({
          kind: "thread",
          id: String(doc.id),
          at: doc.createdAt,
          data: doc,
        }),
      ),
      ideas.docs.map(
        (doc): ActivityEntry => ({
          kind: "idea",
          id: String(doc.id),
          at: doc.createdAt,
          data: doc,
        }),
      ),
      events.docs.map(
        (doc): ActivityEntry => ({
          kind: "event",
          id: String(doc.id),
          at: doc.createdAt,
          data: doc,
        }),
      ),
      joins.map(
        (row): ActivityEntry => ({
          kind: "join",
          id: row.userId,
          at: row.joinedAt.toISOString(),
          data: {
            id: row.userId,
            name: row.displayName ?? row.name ?? "",
            image: row.image,
          } satisfies ActivityMember,
        }),
      ),
    ],
    cursor,
    limit,
  );

  // Decorate only what made the page: posts get likes, others author photos.
  const pagePosts = entries
    .filter((entry) => entry.kind === "post")
    .map((entry) => entry.data as (typeof posts.docs)[number]);
  const pinnedPosts = pinnedDocs?.docs ?? [];
  const [decorated, decoratedPinned] = await Promise.all([
    decorateFeedPosts(database, payload, pagePosts, viewerId, storage),
    decorateFeedPosts(database, payload, pinnedPosts, viewerId, storage),
  ]);
  const postById = new Map(decorated.map((post) => [String(post.id), post]));
  const authorImages = await loadUserImages(
    database,
    entries.flatMap((entry) =>
      entry.kind === "thread" || entry.kind === "idea"
        ? [(entry.data as { authorId: string }).authorId]
        : [],
    ),
  );

  const items = groupAdjacentJoins<ActivityMember>(entries).map(
    (group): CommunityFeedItem => {
      if (group.kind === "joins") {
        return {
          kind: "joins",
          key: group.key,
          at: group.at,
          members: group.members,
        };
      }
      const { entry } = group;
      const key = `${entry.kind}:${entry.id}`;
      switch (entry.kind) {
        case "post":
          return {
            kind: "post",
            key,
            at: entry.at,
            post: postById.get(entry.id)!,
          };
        case "thread": {
          const doc = entry.data as (typeof threads.docs)[number];
          return {
            kind: "thread",
            key,
            at: entry.at,
            thread: {
              id: doc.id,
              slug: doc.slug ?? "",
              title: doc.title,
              category: doc.category ?? null,
              authorName: doc.authorName ?? null,
              authorImage: authorImages.get(doc.authorId) ?? null,
              replyCount: doc.replyCount ?? 0,
            },
          };
        }
        case "idea": {
          const doc = entry.data as (typeof ideas.docs)[number];
          return {
            kind: "idea",
            key,
            at: entry.at,
            idea: {
              id: doc.id,
              title: doc.title,
              authorName: doc.authorName ?? null,
              authorImage: authorImages.get(doc.authorId) ?? null,
              voteCount: doc.voteCount ?? 0,
              status: doc.status ?? null,
            },
          };
        }
        case "event": {
          const doc = entry.data as (typeof events.docs)[number];
          return {
            kind: "event",
            key,
            at: entry.at,
            event: {
              id: doc.id,
              slug: doc.slug ?? "",
              title: doc.title,
              type: doc.type ?? null,
              date: doc.date,
              startTime: doc.startTime ?? null,
              endTime: doc.endTime ?? null,
              timezone: doc.timezone ?? null,
              location: doc.location ?? null,
            },
          };
        }
        case "join":
          // Joins are always folded into groups above.
          throw new Error("unreachable: ungrouped join");
      }
    },
  );

  return { pinned: decoratedPinned, items, nextCursor };
}
