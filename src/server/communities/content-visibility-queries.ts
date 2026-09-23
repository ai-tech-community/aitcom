/** Thin DB glue for community visibility. Policy lives in ./content-visibility. */

import { and, eq, isNull, ne, notInArray } from "drizzle-orm";

import { communities, communityMemberships } from "@/server/db/schema";
import type { db as _db } from "@/server/db";

import {
  canReadContent,
  canReadRoster,
  type CommunityVisibility,
} from "./content-visibility";
import { HUB_SLUG } from "./hub";

type DB = typeof _db;

type CommunityRef = CommunityVisibility & { id: string };

export async function isActiveCommunityMember(
  db: DB,
  communityId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { communityId: true },
  });
  return !!membership;
}

/** Skips the membership lookup when the content is public anyway. */
export async function viewerCanReadContent(
  db: DB,
  community: CommunityRef,
  userId: string | null | undefined,
): Promise<boolean> {
  if (canReadContent(community, false)) return true;
  return isActiveCommunityMember(db, community.id, userId);
}

/**
 * The live community with this slug, or null when it does not exist or the
 * viewer may not read its content. Callers answer both cases the same way
 * (NOT_FOUND), so an unlisted community is not confirmed to exist.
 */
export async function findReadableCommunityBySlug(
  db: DB,
  slug: string,
  userId: string | null | undefined,
): Promise<CommunityRef | null> {
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: { id: true, slug: true, isListedInDirectory: true },
  });
  if (!community) return null;
  return (await viewerCanReadContent(db, community, userId)) ? community : null;
}

/**
 * Whether the viewer may read a content row (forum thread, idea) scoped to
 * `communityId`. A null id is legacy Hub content and always readable.
 */
export async function viewerCanReadContentOf(
  db: DB,
  communityId: string | null | undefined,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!communityId) return true;
  const community = await db.query.communities.findFirst({
    where: eq(communities.id, communityId),
    columns: { id: true, slug: true, isListedInDirectory: true },
  });
  if (!community) return false;
  return viewerCanReadContent(db, community, userId);
}

export async function viewerCanReadRoster(
  db: DB,
  community: CommunityRef,
  userId: string | null | undefined,
): Promise<boolean> {
  if (canReadRoster(community, false)) return true;
  return isActiveCommunityMember(db, community.id, userId);
}

/**
 * Ids of communities whose content the viewer may not read: unlisted, not the
 * Hub, and no active membership. Soft-deleted communities are included, so
 * their threads never resurface in cross-community listings.
 */
export async function hiddenContentCommunityIds(
  db: DB,
  userId: string | null | undefined,
): Promise<string[]> {
  const conditions = [
    eq(communities.isListedInDirectory, false),
    ne(communities.slug, HUB_SLUG),
  ];
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
  return rows.map((r) => r.id);
}
