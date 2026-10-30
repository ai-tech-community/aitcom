import { and, eq, isNull, or, sql } from "drizzle-orm";

import {
  asMemberCount,
  pickHomeCommunities,
  type FeaturedCommunityCard,
} from "@/server/communities/featured";
import { HUB_SLUG } from "@/server/communities/hub";
import type { db as _db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";

type DB = typeof _db;

/**
 * Live homepage gallery: curated communities, then other listed communities.
 * Includes the existing unlisted Hub exception; never invents activity counts.
 */
export async function loadFeaturedCommunities(
  db: DB,
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
    })
    .from(communities)
    .leftJoin(memberCountSq, eq(communities.id, memberCountSq.communityId))
    .where(
      and(
        isNull(communities.deletedAt),
        or(
          eq(communities.isListedInDirectory, true),
          eq(communities.slug, HUB_SLUG),
        ),
      ),
    );

  return pickHomeCommunities(
    rows.map((row) => ({
      ...row,
      memberCount: asMemberCount(row.memberCount),
    })),
  );
}
