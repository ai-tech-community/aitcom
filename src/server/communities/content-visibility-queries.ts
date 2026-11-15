/** Thin DB glue for community visibility. Policy lives in ./content-visibility. */

import {
  and,
  eq,
  inArray,
  isNull,
  isNotNull,
  not,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";

import {
  communities,
  communityMemberships,
  paymentPolicies,
} from "@/server/db/schema";
import type { db as _db } from "@/server/db";

import {
  canReadContent,
  canReadRoster,
  communityVisibilityOf,
  type CommunityVisibility,
} from "./content-visibility";
import { HUB_SLUG } from "./hub";
import type { MembershipStatus } from "./invite-policy";
import {
  canReadPaidCommunity,
  membershipPaymentAllowed,
  paymentsEnabled,
} from "@/server/payments/access";

type DB = typeof _db;

export type CommunityRef = CommunityVisibility & { id: string };

/**
 * Just the visibility facts of a community row, for callers that hand a
 * community on to the seam. Copying them here, not field by field at each
 * call site, means a new visibility fact reaches every caller at once.
 */
export function communityRefOf(row: CommunityRef): CommunityRef {
  return { id: row.id, ...communityVisibilityOf(row) };
}

/** The `community` columns every visibility decision reads. */
export const COMMUNITY_VISIBILITY_COLUMNS = {
  id: true,
  slug: true,
  isListedInDirectory: true,
  joinPolicy: true,
} as const;

/**
 * SQL twin of `isPublicCommunity` over the `community` table: listed and
 * open. Queries that select communities by visibility use these twins, so
 * the rule keeps one definition in SQL as in code.
 */
export function publicCommunitySql(): SQL {
  return and(
    eq(communities.isListedInDirectory, true),
    eq(communities.joinPolicy, "open"),
  )!;
}

/**
 * SQL twin of `isPublicDirectoryCommunity`: listed, or the Hub. Listing
 * only, never access.
 */
export function publicDirectoryCommunitySql(): SQL {
  return or(
    eq(communities.isListedInDirectory, true),
    eq(communities.slug, HUB_SLUG),
  )!;
}

/** Slugs of the live communities on the public directory. */
export async function directoryCommunitySlugs(db: DB): Promise<string[]> {
  const rows = await db
    .select({ slug: communities.slug })
    .from(communities)
    .where(and(publicDirectoryCommunitySql(), isNull(communities.deletedAt)));
  return rows.map((row) => row.slug);
}

/** SQL twin of `isContentPublic`: the Hub, or a public community. */
export function contentPublicCommunitySql(): SQL {
  return or(eq(communities.slug, HUB_SLUG), publicCommunitySql())!;
}

/**
 * SQL twin of `!isContentPublic`: not the Hub, and unlisted or private.
 * Both columns are NOT NULL, so the negation is exact.
 */
export function contentPrivateCommunitySql(): SQL {
  return not(contentPublicCommunitySql());
}

/**
 * The user's role in the community when they are an active member whose
 * paid membership (where the community charges) is in order; null for
 * anyone else, signed-out visitors included. Staff roles never pay.
 */
export async function activeCommunityRole(
  db: DB,
  communityId: string,
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { role: true },
  });
  if (!membership) return null;
  return roleInGoodStanding(db, communityId, userId, membership.role);
}

/** An active member's role, unless their paid membership lapsed. */
async function roleInGoodStanding(
  db: DB,
  communityId: string,
  userId: string,
  role: string,
): Promise<string | null> {
  if (
    role === "member" &&
    !(await membershipPaymentAllowed(db, communityId, userId))
  ) {
    return null;
  }
  return role;
}

/**
 * Where a user stands in a community, in one read: their membership row's
 * `status` (null without a row, or signed out) — what join controls go by
 * (`viewerJoinAction`) — and their `activeRole` by the same rule as
 * `activeCommunityRole`.
 */
export async function communityStanding(
  db: DB,
  communityId: string,
  userId: string | null | undefined,
): Promise<{ status: MembershipStatus | null; activeRole: string | null }> {
  if (!userId) return { status: null, activeRole: null };
  const membership = await db.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, communityId),
      eq(communityMemberships.userId, userId),
    ),
    columns: { role: true, status: true },
  });
  if (!membership) return { status: null, activeRole: null };
  return {
    status: membership.status,
    activeRole:
      membership.status === "active"
        ? await roleInGoodStanding(db, communityId, userId, membership.role)
        : null,
  };
}

export async function isActiveCommunityMember(
  db: DB,
  communityId: string,
  userId: string | null | undefined,
): Promise<boolean> {
  return (await activeCommunityRole(db, communityId, userId)) !== null;
}

/**
 * Ids of the communities the user is an active member of in good standing:
 * the set `isActiveCommunityMember` answers yes for, read in one pass. A
 * member whose paid membership lapsed is not in it, so discovery cards,
 * the Featured strip and the agent's browse show them what any outsider
 * sees. Staff roles never pay.
 */
export async function activeMemberCommunityIds(
  db: DB,
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({
      communityId: communityMemberships.communityId,
      role: communityMemberships.role,
    })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
      ),
    );
  const ids = new Set(rows.map((r) => r.communityId));
  if (!paymentsEnabled()) return ids;
  const paying = rows
    .filter((r) => r.role === "member")
    .map((r) => r.communityId);
  if (paying.length === 0) return ids;
  const paid = await db
    .select({ id: paymentPolicies.communityId })
    .from(paymentPolicies)
    .where(
      and(
        inArray(paymentPolicies.communityId, paying),
        isNotNull(paymentPolicies.paidEntryAt),
      ),
    );
  for (const { id } of paid) {
    if (!(await membershipPaymentAllowed(db, id, userId))) ids.delete(id);
  }
  return ids;
}

/** Skips the membership lookup when the content is public anyway. */
export async function viewerCanReadContent(
  db: DB,
  community: CommunityRef,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!(await canReadPaidCommunity(db, community.id, userId))) return false;
  if (canReadContent(community, false)) return true;
  return isActiveCommunityMember(db, community.id, userId);
}

/**
 * The live community with this slug, or null when it does not exist or the
 * viewer may not read its content. Callers answer both cases the same way
 * (NOT_FOUND), so a members-only community is not confirmed to exist.
 */
export async function findReadableCommunityBySlug(
  db: DB,
  slug: string,
  userId: string | null | undefined,
): Promise<CommunityRef | null> {
  const community = await db.query.communities.findFirst({
    where: and(eq(communities.slug, slug), isNull(communities.deletedAt)),
    columns: COMMUNITY_VISIBILITY_COLUMNS,
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
    columns: COMMUNITY_VISIBILITY_COLUMNS,
  });
  if (!community) return false;
  return viewerCanReadContent(db, community, userId);
}

/**
 * Both reads for one viewer in one pass: the paid-entry check once, and
 * the membership lookup only when the community's content or roster is not
 * public anyway. Same answers as `viewerCanReadContent` and
 * `viewerCanReadRoster`.
 */
export async function viewerCommunityAccess(
  db: DB,
  community: CommunityRef,
  userId: string | null | undefined,
): Promise<{ content: boolean; roster: boolean }> {
  if (!(await canReadPaidCommunity(db, community.id, userId))) {
    return { content: false, roster: false };
  }
  const content = canReadContent(community, false);
  const roster = canReadRoster(community, false);
  if (content && roster) return { content, roster };
  const isMember = await isActiveCommunityMember(db, community.id, userId);
  return {
    content: canReadContent(community, isMember),
    roster: canReadRoster(community, isMember),
  };
}

export async function viewerCanReadRoster(
  db: DB,
  community: CommunityRef,
  userId: string | null | undefined,
): Promise<boolean> {
  if (!(await canReadPaidCommunity(db, community.id, userId))) return false;
  if (canReadRoster(community, false)) return true;
  return isActiveCommunityMember(db, community.id, userId);
}

/**
 * Ids of communities whose content the viewer may not read: not the Hub,
 * unlisted or private (`contentPrivateCommunitySql`), and no active
 * membership. Soft-deleted members-only communities are included;
 * soft-deletion itself does not hide content.
 *
 * Callers pass the ids to Payload as a `NOT IN` list (a Payload `where`
 * cannot hold a subquery), so the list grows with the number of
 * members-only communities. Fine at today's scale; keep it off per-row hot
 * paths.
 */
export async function hiddenContentCommunityIds(
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
  const hidden = rows.map((r) => r.id);
  if (paymentsEnabled()) {
    const paid = await db
      .select({ id: paymentPolicies.communityId })
      .from(paymentPolicies)
      .where(isNotNull(paymentPolicies.paidEntryAt));
    for (const { id } of paid)
      if (!(await canReadPaidCommunity(db, id, userId))) hidden.push(id);
  }
  return [...new Set(hidden)];
}
