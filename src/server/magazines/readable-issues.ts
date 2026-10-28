import { eq, isNotNull, or } from "drizzle-orm";
import type { Where } from "payload";

import { isContentPublic } from "@/server/communities/content-visibility";
import type { db } from "@/server/db";
import { communities } from "@/server/db/schema";

import type { PayloadClient } from "./deps";
import {
  type EditorScope,
  loadEditorScope,
  type MagazineStanding,
} from "./editorship";

/**
 * What a viewer may read across all magazine issues, as id lists a Payload
 * `where` can hold (it cannot hold a subquery). The query twin of
 * `resolveMagazineIssueAccess` (ADR-0042); the parity test in
 * `issue-access.integration.test.ts` pins the two forms together.
 */
export type IssueReadScope = {
  /** Communities whose magazine the viewer edits: every issue, any status. */
  editorCommunityIds: readonly string[];
  /** Active memberships: published issues at any visibility. */
  memberCommunityIds: readonly string[];
  /** Content-private: unlisted and not the Hub. */
  privateCommunityIds: readonly string[];
  /** Soft-deleted: no access for anyone, editors included. */
  deletedCommunityIds: readonly string[];
};

/** Listings accept previews; article surfaces need full reading access. */
export type IssueReach = "teaser" | "full";

export type ScopeCommunity = {
  id: string;
  slug: string;
  isListedInDirectory: boolean;
  deletedAt: Date | null;
};

/**
 * The pure half of `loadIssueReadScope`. The editor and member ids come
 * from the editorship seam (`loadEditorScope`), the private and deleted
 * ids from the same predicate as the resolver (`isContentPublic`), so the
 * Hub rule and the editor rule each have one definition. Communities that
 * are listed and live may be omitted from `rows`; they add nothing.
 */
export function buildIssueReadScope(
  standing: EditorScope,
  rows: readonly ScopeCommunity[],
): IssueReadScope {
  return {
    editorCommunityIds: standing.editorCommunityIds,
    memberCommunityIds: standing.memberCommunityIds,
    privateCommunityIds: rows
      .filter((c) => c.deletedAt === null && !isContentPublic(c))
      .map((c) => c.id),
    deletedCommunityIds: rows
      .filter((c) => c.deletedAt !== null)
      .map((c) => c.id),
  };
}

/**
 * Derive one live community's issue scope from its already-loaded standing.
 * The caller must exclude soft-deleted communities before using this helper.
 */
export function issueReadScopeForCommunity(
  standing: Pick<MagazineStanding, "isEditor" | "isMember">,
  community: Omit<ScopeCommunity, "deletedAt">,
): IssueReadScope {
  return buildIssueReadScope(
    {
      editorCommunityIds: standing.isEditor ? [community.id] : [],
      memberCommunityIds: standing.isMember ? [community.id] : [],
    },
    [{ ...community, deletedAt: null }],
  );
}

/**
 * The viewer's issue read scope: the viewer's editorship across magazines
 * (one query) and one community query (unlisted or soft-deleted rows).
 * Like `hiddenContentCommunityIds`, the id lists grow with the number of
 * such communities; fine at today's scale, keep it off per-row hot paths.
 */
export async function loadIssueReadScope(
  database: typeof db,
  viewerId: string | null,
): Promise<IssueReadScope> {
  const [standing, rows] = await Promise.all([
    loadEditorScope(database, viewerId),
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
  return buildIssueReadScope(standing, rows);
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
 * `resolveMagazineIssueAccess` answers at least the requested reach for:
 *
 *   communityId not_in deleted AND (
 *     communityId in editor OR (
 *       published AND (
 *         communityId in member OR (
 *           outsider visibility AND (communityId not_in private OR publicConfirmedAt exists)))))
 *
 * A branch whose id list is empty is omitted, never emitted as `in: []`.
 */
export function readableIssueWhere(
  scope: IssueReadScope,
  reach: IssueReach,
): Where {
  const outsiderVisibility: Where =
    reach === "teaser"
      ? { visibility: { in: ["teaser", "public"] } }
      : { visibility: { equals: "public" } };
  const outsiderBranch =
    scope.privateCommunityIds.length > 0
      ? allOf(
          outsiderVisibility,
          anyOf(
            { communityId: { not_in: [...scope.privateCommunityIds] } },
            { publicConfirmedAt: { exists: true } },
          ),
        )
      : outsiderVisibility;

  const readerBranch = allOf(
    { status: { equals: "published" } },
    scope.memberCommunityIds.length > 0
      ? anyOf(
          { communityId: { in: [...scope.memberCommunityIds] } },
          outsiderBranch,
        )
      : outsiderBranch,
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
  payload: Pick<PayloadClient, "find">,
  scope: IssueReadScope,
  reach: IssueReach,
  narrow?: Where,
): Promise<number[]> {
  const readable = readableIssueWhere(scope, reach);
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
