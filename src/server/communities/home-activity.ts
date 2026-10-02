import { and, desc, eq, isNull } from "drizzle-orm";

import type { ActivityCursor } from "@/lib/community-activity";
import type { db as Db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import type { getPayloadClient } from "@/server/payload";
import type { VideoStorageSource } from "@/server/media/video-storage";

import { loadActivityStream, type CommunityFeedItem } from "./activity-feed";
import { feedViewerFor } from "./post-visibility";
import type { CommunityRole } from "./role-utils";

type Database = typeof Db;
type Payload = Awaited<ReturnType<typeof getPayloadClient>>;

/**
 * At most this many communities feed Home. The cap bounds the `IN (...)`
 * list each source query carries; the query count is the same for 1 or 50
 * communities. Past the cap, the most recently joined communities win: they
 * are the ones a member is most likely following right now.
 */
export const HOME_COMMUNITY_CAP = 50;

/** How an item names its community on Home, and the viewer's role there. */
export type HomeActivityCommunity = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  /** The viewer's own role, for the post card's moderator actions. */
  viewerRole: CommunityRole;
};

export type HomeFeedItem = CommunityFeedItem & {
  community: HomeActivityCommunity;
};

export type HomeActivityPage = {
  items: HomeFeedItem[];
  nextCursor: ActivityCursor | null;
  /** False when the viewer is an active member of no community at all. */
  hasCommunities: boolean;
};

/**
 * The communities Home reads for a viewer: their active memberships only
 * (never invited, pending or banned), in live communities. An active
 * member may read every community they belong to, so nothing else is
 * needed to keep a community the viewer cannot read out of the set.
 */
export async function loadHomeCommunities(
  database: Database,
  userId: string,
): Promise<HomeActivityCommunity[]> {
  const rows = await database
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      logoUrl: communities.logoUrl,
      role: communityMemberships.role,
    })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communityMemberships.communityId, communities.id),
    )
    .where(
      and(
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
        isNull(communities.deletedAt),
      ),
    )
    .orderBy(desc(communityMemberships.joinedAt), communities.id)
    .limit(HOME_COMMUNITY_CAP);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    logoUrl: row.logoUrl,
    viewerRole: row.role,
  }));
}

/**
 * One page of Home's "From your communities": the shared activity stream
 * over the viewer's communities, each item labelled with its community.
 * Pinned posts belong to a community's own Overview, not here.
 */
export async function loadHomeActivity({
  database,
  payload,
  userId,
  storage,
  cursor,
  limit,
}: {
  database: Database;
  payload: Payload;
  userId: string;
  storage: VideoStorageSource;
  cursor: ActivityCursor | null;
  limit: number;
}): Promise<HomeActivityPage> {
  const memberOf = await loadHomeCommunities(database, userId);
  if (memberOf.length === 0) {
    return { items: [], nextCursor: null, hasCommunities: false };
  }
  const byId = new Map(memberOf.map((community) => [community.id, community]));
  const { items, nextCursor } = await loadActivityStream({
    database,
    payload,
    scopes: memberOf.map((community) => ({
      id: community.id,
      slug: community.slug,
      viewer: feedViewerFor(userId, { role: community.viewerRole }),
    })),
    viewerId: userId,
    storage,
    cursor,
    limit,
  });
  return {
    // Every item comes from one of the scopes, so its community is known.
    items: items.map((item) => ({
      ...item,
      community: byId.get(item.communityId)!,
    })),
    nextCursor,
    hasCommunities: true,
  };
}
