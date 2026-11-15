import { cache } from "react";
import { and, eq, notInArray, sql } from "drizzle-orm";

import { eventCommunityIsPublic } from "@/lib/events/public-event-access";
import {
  COMMUNITY_VISIBILITY_COLUMNS,
  contentPrivateCommunitySql,
  isActiveCommunityMember,
} from "@/server/communities/content-visibility-queries";
import { communities, communityMemberships } from "@/server/db/schema";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

/**
 * Communities whose events this viewer may not see: those whose content is
 * not public (`contentPrivateCommunitySql`: not the Hub, and unlisted or
 * private), plus orphaned community ids. Active memberships are left out.
 * Matches `eventCommunityIsPublic` and fails closed.
 */
export const hiddenEventCommunityIds = cache(
  async function hiddenEventCommunityIds(
    db: DB,
    userId: string | null | undefined,
  ): Promise<string[]> {
    const conditions = [contentPrivateCommunitySql()];
    if (userId) {
      const memberOf = db
        .select({ id: communityMemberships.communityId })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.userId, userId),
            eq(communityMemberships.status, "active"),
          ),
        );
      conditions.push(notInArray(communities.id, memberOf));
    }
    const rows = await db
      .select({ id: communities.id })
      .from(communities)
      .where(and(...conditions));
    // Event community IDs are text rather than foreign keys. Orphaned IDs
    // must join the deny-list as well, so deleting a community cannot make
    // its events public through listings or the sitemap.
    const orphaned = await db.execute<{ id: string }>(sql`
      select distinct events.community_id as id
      from public.events
      left join ${communities} on ${communities.id} = events.community_id
      where events.community_id is not null and ${communities.id} is null
    `);
    return [
      ...new Set([
        ...rows.map((row) => row.id),
        ...orphaned.rows.map((row) => row.id),
      ]),
    ];
  },
);

/** `null` when the lookup fails, so callers can fail closed. */
export async function loadHiddenEventCommunityIds(
  db: DB,
  userId: string | null | undefined,
): Promise<readonly string[] | null> {
  try {
    return await hiddenEventCommunityIds(db, userId);
  } catch (error) {
    console.error("[events] hidden community lookup failed", error);
    return null;
  }
}

/**
 * Whether this viewer may read one event's community. No community means a
 * public unscoped event. A missing community row fails closed.
 */
export const viewerMaySeeEvent = cache(async function viewerMaySeeEvent(
  db: DB,
  communityId: string | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!communityId) return true;
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
    columns: COMMUNITY_VISIBILITY_COLUMNS,
  });
  if (!community) return false;
  if (eventCommunityIsPublic(community)) return true;
  return isActiveCommunityMember(db, community.id, userId);
});
