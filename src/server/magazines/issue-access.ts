import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

import {
  ISSUE_STATUSES,
  ISSUE_VISIBILITIES,
  type IssueStatus,
  type IssueVisibility,
} from "@/lib/magazines/values";
import {
  type CommunityVisibility,
  isContentPublic,
} from "@/server/communities/content-visibility";
import type { CommunityRole } from "@/server/communities/role-utils";
import type { db } from "@/server/db";
import { communities } from "@/server/db/schema";

import { activeCommunityRole } from "./viewer-role";

/**
 * Who may read a magazine issue (ADR-0042). The single source of the issue
 * read rules; `readableIssueWhere` is its query twin, pinned by a parity test.
 *
 * - none   — may not know the issue exists (callers answer NOT_FOUND)
 * - full   — may read the published issue
 * - editor — a magazine editor: sees drafts, unavailable-item markers and
 *            the latest draft text
 *
 * Slice 6 adds `teaser` here and to `ISSUE_VISIBILITIES` in the same change;
 * every surface switches exhaustively over this union.
 */
export type MagazineIssueAccess = "none" | "full" | "editor";

const EDITOR_ROLES: ReadonlySet<CommunityRole> = new Set(["owner", "admin"]);

/**
 * Whether an active community role edits the community's magazine. Slice 1:
 * owner or admin; moderators are readers. Slice 3 replaces this predicate
 * with per-magazine staff roles.
 */
export function isMagazineEditorRole(role: CommunityRole | null): boolean {
  return role !== null && EDITOR_ROLES.has(role);
}

/** The gate for every magazine editing procedure: non-editors get FORBIDDEN. */
export function requireMagazineEditor(role: CommunityRole | null): void {
  if (!isMagazineEditorRole(role)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export type IssueAccessInput = {
  /** `role` is the viewer's active membership role, or null. */
  viewer: { userId: string | null; role: CommunityRole | null };
  community: (CommunityVisibility & { deleted: boolean }) | null;
  issue: {
    status: IssueStatus;
    visibility: IssueVisibility;
    publicConfirmedAt: string | null;
  };
};

/**
 * The visibility a non-member effectively gets (ADR-0042, Decision 5). In a
 * content-public community (the Hub or a listed community) it is the stored
 * value. In a content-private community, `public` counts only when a
 * confirmation is recorded; an unconfirmed public issue counts as members.
 */
export function effectiveVisibility(
  issue: Pick<IssueAccessInput["issue"], "visibility" | "publicConfirmedAt">,
  community: CommunityVisibility,
): IssueVisibility {
  switch (issue.visibility) {
    case "members":
      return "members";
    case "public":
      return isContentPublic(community) || issue.publicConfirmedAt
        ? "public"
        : "members";
  }
}

export function resolveMagazineIssueAccess(
  input: IssueAccessInput,
): MagazineIssueAccess {
  const { viewer, community, issue } = input;
  if (community === null || community.deleted) return "none";
  if (isMagazineEditorRole(viewer.role)) return "editor";
  if (issue.status !== "published") return "none";
  if (viewer.role !== null) return "full";
  return effectiveVisibility(issue, community) === "public" ? "full" : "none";
}

export type LoadableIssue = {
  communityId: string;
  status: string;
  visibility: string;
  publicConfirmedAt?: string | null;
};

function isIssueStatus(value: string): value is IssueStatus {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

function isIssueVisibility(value: string): value is IssueVisibility {
  return (ISSUE_VISIBILITIES as readonly string[]).includes(value);
}

/**
 * An issue's stored access facts, checked against the known value lists.
 * Null when the stored status or visibility is outside them: callers treat
 * that as `none`, so an unknown value never widens access.
 */
export function issueAccessFacts(
  issue: Omit<LoadableIssue, "communityId">,
): IssueAccessInput["issue"] | null {
  if (!isIssueStatus(issue.status) || !isIssueVisibility(issue.visibility)) {
    return null;
  }
  return {
    status: issue.status,
    visibility: issue.visibility,
    publicConfirmedAt: issue.publicConfirmedAt ?? null,
  };
}

/**
 * The viewer's access to an issue, read from the database. A community that
 * is missing or soft-deleted is `none` for everyone, editors included. A
 * stored status or visibility outside the known lists is `none`: an unknown
 * value never widens access.
 */
export async function loadMagazineIssueAccess(
  database: typeof db,
  issue: LoadableIssue,
  viewerId: string | null,
): Promise<MagazineIssueAccess> {
  const facts = issueAccessFacts(issue);
  if (facts === null) return "none";

  const community = await database.query.communities.findFirst({
    where: eq(communities.id, issue.communityId),
    columns: { slug: true, isListedInDirectory: true, deletedAt: true },
  });
  const role = community
    ? await activeCommunityRole(database, issue.communityId, viewerId)
    : null;

  return resolveMagazineIssueAccess({
    viewer: { userId: viewerId, role },
    community: community
      ? {
          slug: community.slug,
          isListedInDirectory: community.isListedInDirectory,
          deleted: community.deletedAt !== null,
        }
      : null,
    issue: facts,
  });
}
