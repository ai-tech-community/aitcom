import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  FEATURED_COMMUNITY_SLUGS,
  pickFeaturedCommunities,
  type FeaturedCommunityCard,
} from "@/server/communities/featured";
import type { db as _db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";

type DB = typeof _db;

/**
 * Live cards for the homepage strip: name / blurb / logo / member count.
 * Includes the unlisted Hub. Does not invent activity or thread counts.
 */
export async function loadFeaturedCommunities(
  db: DB,
): Promise<FeaturedCommunityCard[]> {
  const slugs: string[] = [...FEATURED_COMMUNITY_SLUGS];

  const memberCountSq = db
    .select({
      communityId: communityMemberships.communityId,
      count: count().as("member_count"),
    })
    .from(communityMemberships)
    .where(eq(communityMemberships.status, "active"))
    .groupBy(communityMemberships.communityId)
    .as("mc");

  const memberCountExpr = sql<number>`coalesce(${memberCountSq.count}, 0)`;

  const rows = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      description: communities.description,
      logoUrl: communities.logoUrl,
      memberCount: memberCountExpr,
    })
    .from(communities)
    .leftJoin(memberCountSq, eq(communities.id, memberCountSq.communityId))
    .where(
      and(inArray(communities.slug, slugs), isNull(communities.deletedAt)),
    );

  return pickFeaturedCommunities(rows);
}
