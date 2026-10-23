import { cache } from "react";
import { and, eq, ne, notInArray, or } from "drizzle-orm";

import {
  eventCommunityIsPublic,
  PUBLIC_EVENT_JOIN_POLICIES,
} from "@/lib/events/public-event-access";
import { isActiveCommunityMember } from "@/server/communities/content-visibility-queries";
import { HUB_SLUG } from "@/server/communities/hub";
import { communities, communityMemberships } from "@/server/db/schema";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

/**
 * Communities whose events this viewer may not see. The Hub is always
 * public. Every other community is hidden unless it is listed and its join
 * policy is open or approval-required. Invite-only and any unknown policy
 * are hidden. Active memberships are left out. Matches
 * `eventCommunityIsPublic` and fails closed.
 */
export const hiddenEventCommunityIds = cache(
  async function hiddenEventCommunityIds(
    db: DB,
    userId: string | null | undefined,
  ): Promise<string[]> {
    const hiddenFromPublic = or(
      eq(communities.isListedInDirectory, false),
      notInArray(communities.joinPolicy, [...PUBLIC_EVENT_JOIN_POLICIES]),
    );
    if (!hiddenFromPublic) return [];
    const conditions = [ne(communities.slug, HUB_SLUG), hiddenFromPublic];
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
    return rows.map((row) => row.id);
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
    columns: {
      id: true,
      slug: true,
      isListedInDirectory: true,
      joinPolicy: true,
    },
  });
  if (!community) return false;
  if (eventCommunityIsPublic(community)) return true;
  return isActiveCommunityMember(db, community.id, userId);
});
