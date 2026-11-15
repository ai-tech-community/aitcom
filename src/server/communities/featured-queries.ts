import { and, eq, isNull, sql } from "drizzle-orm";

import {
  asMemberCount,
  featuredCardsForViewer,
  pickHomeCommunities,
  type FeaturedCommunityCard,
} from "@/server/communities/featured";
import { loadMemberCommunityIds } from "@/server/communities/discovery-queries";
import { publicDirectoryCommunitySql } from "@/server/communities/content-visibility-queries";
import type { db as _db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";

type DB = typeof _db;

/**
 * Live homepage gallery: curated communities, then other listed communities.
 * Includes the existing unlisted Hub exception; never invents activity counts.
 * Picked on the real counts, then shown as this viewer may see them: a
 * private community's count only to its members (ADR-0050).
 */
export async function loadFeaturedCommunities(
  db: DB,
  viewerId: string | null,
): Promise<FeaturedCommunityCard[]> {
  const memberCountSq = db
    .select({
      communityId: communityMemberships.communityId,
      count: sql<number>`count(*)::int`.as("member_count"),
    })
    .from(communityMemberships)
    .where(eq(communityMemberships.status, "active"))
    .groupBy(communityMemberships.communityId)
    .as("mc");

  const memberCountExpr = sql<number>`coalesce(${memberCountSq.count}, 0)::int`;

  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      description: communities.description,
      logoUrl: communities.logoUrl,
      memberCount: memberCountExpr,
      isListedInDirectory: communities.isListedInDirectory,
      joinPolicy: communities.joinPolicy,
    })
    .from(communities)
    .leftJoin(memberCountSq, eq(communities.id, memberCountSq.communityId))
    .where(and(isNull(communities.deletedAt), publicDirectoryCommunitySql()));

  const picked = pickHomeCommunities(
    rows.map((row) => ({
      ...row,
      memberCount: asMemberCount(row.memberCount),
    })),
  );
  const memberOf = viewerId
    ? await loadMemberCommunityIds(db, viewerId)
    : new Set<string>();
  return featuredCardsForViewer(picked, memberOf);
}
