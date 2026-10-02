import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { COMMUNITY_ORGANIZER_ROLES } from "@/lib/communities/organizer-roles";
import type { db as _db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";

type DB = typeof _db;

/** Join requests waiting in one community the member runs. */
export type PendingJoinRequests = {
  communityId: string;
  slug: string;
  name: string;
  /** People waiting for approval; always more than zero. */
  count: number;
};

/**
 * For each community the member runs (an active organizer role), how many
 * people are waiting for approval. One grouped query, ordered by community
 * name; communities with no pending requests do not appear.
 *
 * Shared by Home's Next up and the My communities tab, so both always agree
 * on who reviews requests and what counts as one.
 */
export async function countPendingJoinRequests(
  db: DB,
  userId: string,
): Promise<PendingJoinRequests[]> {
  const mine = alias(communityMemberships, "mine");
  const pending = alias(communityMemberships, "pending");

  const rows = await db
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
        eq(mine.userId, userId),
        eq(mine.status, "active"),
        inArray(mine.role, [...COMMUNITY_ORGANIZER_ROLES]),
      ),
    )
    .groupBy(communities.id, communities.slug, communities.name)
    .orderBy(asc(communities.name));

  return rows.map((row) => ({ ...row, count: Number(row.count) }));
}
