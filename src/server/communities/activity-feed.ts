import { and, desc, eq, inArray, lt } from "drizzle-orm";
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
import {
  forumThreadCommunitiesWhere,
  forumThreadCommunityOf,
} from "@/server/communities/forum-scope";
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

/** Fields every feed item carries, whatever its kind. */
type FeedItemBase = {
  key: string;
  at: string;
  /** The community the item belongs to (the Hub for unscoped threads). */
  communityId: string;
};

export type CommunityFeedItem = FeedItemBase &
  (
    | { kind: "post"; post: FeedPostView }
    | { kind: "thread"; thread: ActivityThread }
    | { kind: "idea"; idea: ActivityIdea }
    | { kind: "event"; event: ActivityEvent }
    | { kind: "joins"; members: ActivityMember[] }
  );

export type CommunityActivityPage = {
  /** Pinned posts, first page only; they are left out of the stream. */
  pinned: FeedPostView[];
  items: CommunityFeedItem[];
  nextCursor: ActivityCursor | null;
};

/** One community a stream reads, and who is looking at its posts there. */
export type ActivityScope = {
  id: string;
  slug: string;
  /** Moderator status is per community, so the post rule is too. */
  viewer: FeedViewer;
};

export type ActivityStreamPage = {
  items: CommunityFeedItem[];
  nextCursor: ActivityCursor | null;
};

/**
 * The post visibility rule across several communities. Communities where
 * the viewer looks the same way share one clause, so a member who moderates
 * one community adds one branch, not one per community.
 */
export function scopedPostVisibilityWhere(
  scopes: readonly ActivityScope[],
): Where {
  const byViewer = new Map<string, { viewer: FeedViewer; ids: string[] }>();
  for (const scope of scopes) {
    const id = JSON.stringify(scope.viewer);
    const group = byViewer.get(id) ?? { viewer: scope.viewer, ids: [] };
    group.ids.push(scope.id);
    byViewer.set(id, group);
  }
  const groups = [...byViewer.values()];
  if (groups.length === 1) return postVisibilityWhere(groups[0]!.viewer);
  return {
    or: groups.map(({ viewer, ids }) => ({
      and: [{ communityId: { in: ids } }, postVisibilityWhere(viewer)],
    })),
  };
}

/**
 * One page of activity across a set of communities, read from the content
 * tables (not the activity log, which misses most history). Each source is
 * one query over the whole set (`communityId IN (...)`), so the query count
 * does not grow with the number of communities. Deleted posts and threads,
 * unpublished events, and inactive memberships never appear; pinned posts
 * appear or not as `pinned` says.
 *
 * Callers decide which communities the viewer may read; this reads exactly
 * the scopes it is given.
 */
export async function loadActivityStream({
  database,
  payload,
  scopes,
  viewerId,
  storage,
  cursor,
  limit,
  pinned,
}: {
  database: Database;
  payload: Payload;
  scopes: readonly ActivityScope[];
  viewerId: string;
  storage: VideoStorageSource;
  cursor: ActivityCursor | null;
  limit: number;
  /**
   * `apart`: pinned posts are left out (a community Overview shows them on
   * top). `inStream`: they appear at their own time like any post.
   */
  pinned: "apart" | "inStream";
}): Promise<ActivityStreamPage> {
  if (scopes.length === 0) return { items: [], nextCursor: null };

  const ids = scopes.map((scope) => scope.id);
  // The Hub counts thousands of members; joins there are noise, not news.
  const joinIds = scopes
    .filter((scope) => scope.slug !== HUB_SLUG)
    .map((scope) => scope.id);
  const perSource = limit + SOURCE_HEADROOM;
  const atOrBefore = cursor ? { less_than_equal: cursor.at } : undefined;
  const withCursor = (clauses: Where[]): Where => ({
    and: atOrBefore ? [...clauses, { createdAt: atOrBefore }] : clauses,
  });

  const [posts, threads, ideas, events, joins] = await Promise.all([
    payload.find({
      collection: "feed-posts",
      where: withCursor([
        { communityId: { in: ids } },
        { isDeleted: { not_equals: true } },
        ...(pinned === "apart" ? [{ isPinned: { not_equals: true } }] : []),
        scopedPostVisibilityWhere(scopes),
      ]),
      sort: "-createdAt",
      limit: perSource,
      // The page is cut by the merge; Payload's total count is never used.
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "forum-threads",
      where: withCursor([
        { isDeleted: { not_equals: true } },
        forumThreadCommunitiesWhere(scopes),
      ]),
      sort: "-createdAt",
      limit: perSource,
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "community-ideas",
      where: withCursor([buildIdeasWhere({ communityId: ids })]),
      sort: "-createdAt",
      limit: perSource,
      pagination: false,
      depth: 0,
    }),
    payload.find({
      collection: "events",
      where: withCursor([
        { status: { equals: "published" } },
        { communityId: { in: ids } },
      ]),
      sort: "-createdAt",
      limit: perSource,
      pagination: false,
      draft: false,
      depth: 0,
    }),
    joinIds.length === 0
      ? Promise.resolve([])
      : database
          .select({
            membershipId: communityMemberships.id,
            communityId: communityMemberships.communityId,
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
              inArray(communityMemberships.communityId, joinIds),
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
  ]);

  const { entries, nextCursor } = mergeActivityPage(
    [
      posts.docs.map(
        (doc): ActivityEntry => ({
          kind: "post",
          id: String(doc.id),
          at: doc.createdAt,
          data: doc,
          scope: doc.communityId ?? undefined,
        }),
      ),
      threads.docs.flatMap((doc): ActivityEntry[] => {
        const scope = forumThreadCommunityOf(doc.communityId, scopes);
        return scope
          ? [
              {
                kind: "thread",
                id: String(doc.id),
                at: doc.createdAt,
                data: doc,
                scope: scope.id,
              },
            ]
          : [];
      }),
      ideas.docs.map(
        (doc): ActivityEntry => ({
          kind: "idea",
          id: String(doc.id),
          at: doc.createdAt,
          data: doc,
          scope: doc.communityId ?? undefined,
        }),
      ),
      events.docs.map(
        (doc): ActivityEntry => ({
          kind: "event",
          id: String(doc.id),
          at: doc.createdAt,
          data: doc,
          scope: doc.communityId ?? undefined,
        }),
      ),
      joins.map(
        (row): ActivityEntry => ({
          kind: "join",
          // A membership, not a user: one person joining two communities
          // is two rows.
          id: row.membershipId,
          at: row.joinedAt.toISOString(),
          data: {
            id: row.userId,
            name: row.displayName ?? row.name ?? "",
            image: row.image,
          } satisfies ActivityMember,
          scope: row.communityId,
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
  const [decorated, authorImages] = await Promise.all([
    decorateFeedPosts(database, payload, pagePosts, viewerId, storage),
    loadUserImages(
      database,
      entries.flatMap((entry) =>
        entry.kind === "thread" || entry.kind === "idea"
          ? [(entry.data as { authorId: string }).authorId]
          : [],
      ),
    ),
  ]);
  const postById = new Map(decorated.map((post) => [String(post.id), post]));

  const items = groupAdjacentJoins<ActivityMember>(entries).map(
    (group): CommunityFeedItem => {
      if (group.kind === "joins") {
        return {
          kind: "joins",
          key: group.key,
          at: group.at,
          communityId: group.scope!,
          members: group.members,
        };
      }
      const { entry } = group;
      const base = {
        key: `${entry.kind}:${entry.id}`,
        at: entry.at,
        communityId: entry.scope!,
      };
      switch (entry.kind) {
        case "post":
          return { ...base, kind: "post", post: postById.get(entry.id)! };
        case "thread": {
          const doc = entry.data as (typeof threads.docs)[number];
          return {
            ...base,
            kind: "thread",
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
            ...base,
            kind: "idea",
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
            ...base,
            kind: "event",
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

  return { items, nextCursor };
}

/** A community's pinned posts, newest first, under the same post rule. */
async function loadPinnedPosts({
  database,
  payload,
  community,
  viewerId,
  viewer,
  storage,
}: {
  database: Database;
  payload: Payload;
  community: { id: string };
  viewerId: string;
  viewer: FeedViewer;
  storage: VideoStorageSource;
}): Promise<FeedPostView[]> {
  const { docs } = await payload.find({
    collection: "feed-posts",
    where: {
      and: [
        { communityId: { equals: community.id } },
        { isDeleted: { not_equals: true } },
        { isPinned: { equals: true } },
        postVisibilityWhere(viewer),
      ],
    },
    sort: "-createdAt",
    limit: MAX_PINS,
    pagination: false,
    depth: 0,
  });
  return decorateFeedPosts(database, payload, docs, viewerId, storage);
}

/**
 * One page of a single community's Overview: the shared stream for that one
 * community, plus its pinned posts on the first page (they stay out of the
 * stream).
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
  const [stream, pinned] = await Promise.all([
    loadActivityStream({
      database,
      payload,
      scopes: [{ id: community.id, slug: community.slug, viewer }],
      viewerId,
      storage,
      cursor,
      limit,
      pinned: "apart",
    }),
    cursor
      ? Promise.resolve([])
      : loadPinnedPosts({
          database,
          payload,
          community,
          viewerId,
          viewer,
          storage,
        }),
  ]);
  return { pinned, items: stream.items, nextCursor: stream.nextCursor };
}
