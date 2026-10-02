import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import type { db as appDb } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { canReadRoster } from "@/server/communities/content-visibility";
import { HUB_SLUG } from "@/server/communities/hub";

type Db = typeof appDb;

/**
 * A community shown in a member's identity panel. An explicit allow-list:
 * only what the panel renders.
 */
export interface ProfileCommunity {
  slug: string;
  name: string;
  logoUrl: string | null;
}

/**
 * The communities a member belongs to that this viewer may see them in.
 *
 * Membership is roster information, so the roster rule decides
 * (`canReadRoster`): a listed community always, an unlisted one only when the
 * viewer is an active member too. Only active memberships of live
 * communities count, and the Hub is never listed (ADR-0019: everyone belongs
 * to it, so it says nothing about the member).
 *
 * The caller checks the profile itself is visible to the viewer first.
 */
export async function loadProfileCommunities(
  database: Db,
  { userId, viewerId }: { userId: string; viewerId: string | null },
): Promise<ProfileCommunity[]> {
  const rows = await database
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      logoUrl: communities.logoUrl,
      isListedInDirectory: communities.isListedInDirectory,
    })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communities.id, communityMemberships.communityId),
    )
    .where(
      and(
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
        isNull(communities.deletedAt),
        ne(communities.slug, HUB_SLUG),
      ),
    )
    .orderBy(asc(communities.name));

  const viewerCommunityIds = await viewerActiveCommunityIds(database, {
    viewerId,
    communityIds: rows
      .filter((row) => !canReadRoster(row, false))
      .map((row) => row.id),
  });

  return rows
    .filter((row) => canReadRoster(row, viewerCommunityIds.has(row.id)))
    .map((row) => ({
      slug: row.slug,
      name: row.name,
      logoUrl: row.logoUrl ?? null,
    }));
}

/** Which of `communityIds` the viewer is an active member of. */
async function viewerActiveCommunityIds(
  database: Db,
  {
    viewerId,
    communityIds,
  }: { viewerId: string | null; communityIds: string[] },
): Promise<Set<string>> {
  if (!viewerId || communityIds.length === 0) return new Set();
  const rows = await database
    .select({ communityId: communityMemberships.communityId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.userId, viewerId),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.communityId, communityIds),
      ),
    );
  return new Set(rows.map((row) => row.communityId));
}
