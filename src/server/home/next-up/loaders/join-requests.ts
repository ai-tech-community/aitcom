import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { communities, communityMemberships } from "@/server/db/schema";

import type { NextUpContext, NextUpJoinRequestsItem } from "../types";

/**
 * Roles that review join requests. Matches who can open the community's
 * member settings (`communities/[slug]/settings` admits owner and admin),
 * where the requests are approved.
 */
export const JOIN_REQUEST_REVIEWER_ROLES = ["owner", "admin"] as const;

/**
 * For each community the member runs (active owner or admin), how many
 * people are waiting for approval. One grouped query; communities with no
 * pending requests do not appear.
 */
export async function loadJoinRequestItems(
  ctx: NextUpContext,
): Promise<NextUpJoinRequestsItem[]> {
  const mine = alias(communityMemberships, "mine");
  const pending = alias(communityMemberships, "pending");

  const rows = await ctx.db
    .select({
      communityId: communities.id,
      slug: communities.slug,
      name: communities.name,
      count: count(pending.id),
    })
    .from(mine)
    .innerJoin(
      communities,
      and(eq(communities.id, mine.communityId), isNull(communities.deletedAt)),
    )
    .innerJoin(
      pending,
      and(
        eq(pending.communityId, mine.communityId),
        eq(pending.status, "pending_approval"),
      ),
    )
    .where(
      and(
        eq(mine.userId, ctx.userId),
        eq(mine.status, "active"),
        inArray(mine.role, [...JOIN_REQUEST_REVIEWER_ROLES]),
      ),
    )
    .groupBy(communities.id, communities.slug, communities.name)
    .orderBy(asc(communities.name));

  return rows.map((row) => ({
    kind: "joinRequests",
    key: `joinRequests:${row.communityId}`,
    urgency: { tier: "actionNeeded" },
    communityId: row.communityId,
    slug: row.slug,
    name: row.name,
    count: Number(row.count),
  }));
}
