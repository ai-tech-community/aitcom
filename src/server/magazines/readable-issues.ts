import { eq, isNotNull, or } from "drizzle-orm";
import type { Where } from "payload";

import { isContentPublic } from "@/server/communities/content-visibility";
import type { CommunityRole } from "@/server/communities/role-utils";
import type { db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";

import type { PayloadClient } from "./deps";
import { isMagazineEditorRole } from "./issue-access";

/**
 * What a viewer may read across all magazine issues, as id lists a Payload
 * `where` can hold (it cannot hold a subquery). The query twin of
 * `resolveMagazineIssueAccess` (ADR-0042); the parity test in
 * `issue-access.integration.test.ts` pins the two forms together.
 */
export type IssueReadScope = {
  /** Active owner/admin memberships: every issue, any status. */
  editorCommunityIds: readonly string[];
  /** Active memberships, any role: published issues at any visibility. */
  memberCommunityIds: readonly string[];
  /** Content-private: unlisted and not the Hub. */
  privateCommunityIds: readonly string[];
  /** Soft-deleted: no access for anyone, editors included. */
  deletedCommunityIds: readonly string[];
};

export type ScopeMembership = {
  communityId: string;
  role: CommunityRole;
  status: string;
};

export type ScopeCommunity = {
  id: string;
  slug: string;
  isListedInDirectory: boolean;
  deletedAt: Date | null;
};

/**
 * The pure half of `loadIssueReadScope`. Uses the same predicates as the
 * resolver (`isMagazineEditorRole`, `isContentPublic`), so the Hub rule and
 * the editor rule have one definition. Communities that are listed and live
 * may be omitted from `rows`; they add nothing to the scope.
 */
export function buildIssueReadScope(
  memberships: readonly ScopeMembership[],
  rows: readonly ScopeCommunity[],
): IssueReadScope {
  const active = memberships.filter((ms) => ms.status === "active");
  return {
    editorCommunityIds: active
      .filter((ms) => isMagazineEditorRole(ms.role))
      .map((ms) => ms.communityId),
    memberCommunityIds: active.map((ms) => ms.communityId),
    privateCommunityIds: rows
      .filter((c) => c.deletedAt === null && !isContentPublic(c))
      .map((c) => c.id),
    deletedCommunityIds: rows
      .filter((c) => c.deletedAt !== null)
      .map((c) => c.id),
  };
}

/**
 * The viewer's issue read scope: one membership query and one community
 * query (unlisted or soft-deleted rows). Like `hiddenContentCommunityIds`,
 * the id lists grow with the number of such communities; fine at today's
 * scale, keep it off per-row hot paths.
 */
export async function loadIssueReadScope(
  database: typeof db,
  viewerId: string | null,
): Promise<IssueReadScope> {
  const [memberships, rows] = await Promise.all([
    viewerId === null
      ? Promise.resolve([])
      : database
          .select({
            communityId: communityMemberships.communityId,
            role: communityMemberships.role,
            status: communityMemberships.status,
          })
          .from(communityMemberships)
          .where(eq(communityMemberships.userId, viewerId)),
    database
      .select({
        id: communities.id,
        slug: communities.slug,
        isListedInDirectory: communities.isListedInDirectory,
        deletedAt: communities.deletedAt,
      })
      .from(communities)
      .where(
        or(
          eq(communities.isListedInDirectory, false),
          isNotNull(communities.deletedAt),
        ),
      ),
  ]);
  return buildIssueReadScope(memberships, rows);
}

function allOf(...clauses: Where[]): Where {
  const flat = clauses.flatMap((c) =>
    Object.keys(c).length === 1 && Array.isArray(c.and) ? c.and : [c],
  );
  return flat.length === 1 ? flat[0]! : { and: flat };
}

function anyOf(...clauses: Where[]): Where {
  return clauses.length === 1 ? clauses[0]! : { or: clauses };
}

/**
 * Payload `where` over `magazine-issues` matching exactly the issues
 * `resolveMagazineIssueAccess` does not answer `none` for:
 *
 *   communityId not_in deleted AND (
 *     communityId in editor OR (
 *       published AND (
 *         communityId in member OR (
 *           public AND (communityId not_in private OR publicConfirmedAt exists)))))
 *
 * A branch whose id list is empty is omitted, never emitted as `in: []`.
 */
export function readableIssueWhere(scope: IssueReadScope): Where {
  const isPublic: Where = { visibility: { equals: "public" } };
  const publicBranch =
    scope.privateCommunityIds.length > 0
      ? allOf(
          isPublic,
          anyOf(
            { communityId: { not_in: [...scope.privateCommunityIds] } },
            { publicConfirmedAt: { exists: true } },
          ),
        )
      : isPublic;

  const readerBranch = allOf(
    { status: { equals: "published" } },
    scope.memberCommunityIds.length > 0
      ? anyOf(
          { communityId: { in: [...scope.memberCommunityIds] } },
          publicBranch,
        )
      : publicBranch,
  );

  const access =
    scope.editorCommunityIds.length > 0
      ? anyOf(
          { communityId: { in: [...scope.editorCommunityIds] } },
          readerBranch,
        )
      : readerBranch;

  return scope.deletedCommunityIds.length > 0
    ? allOf({ communityId: { not_in: [...scope.deletedCommunityIds] } }, access)
    : access;
}

/** Ids of issues readable in this scope, optionally narrowed (e.g. by magazine). */
export async function readableIssueIds(
  payload: PayloadClient,
  scope: IssueReadScope,
  narrow?: Where,
): Promise<number[]> {
  const readable = readableIssueWhere(scope);
  const result = await payload.find({
    collection: "magazine-issues",
    where: narrow ? { and: [readable, narrow] } : readable,
    pagination: false,
    depth: 0,
    // Payload always returns `id`; select one small column to skip the rest.
    select: { communityId: true },
  });
  return result.docs.map((doc) => Number(doc.id));
}
