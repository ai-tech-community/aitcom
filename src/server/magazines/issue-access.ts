import { eq } from "drizzle-orm";

import type { MagazineIssueAccess } from "@/lib/magazines/access";
import {
  ISSUE_STATUSES,
  ISSUE_VISIBILITIES,
  type IssueStatus,
  type IssueVisibility,
} from "@/lib/magazines/values";
import { effectiveVisibility } from "@/lib/magazines/visibility";
import type { CommunityVisibility } from "@/server/communities/content-visibility";
import type { db } from "@/server/db";
import { communities } from "@/server/db/schema";

import type { Deps } from "./deps";
import {
  loadMagazineEditorship,
  type MagazineStanding,
  NO_STANDING,
  standingOf,
} from "./editorship";
import { relationIdOrNull } from "./relation-id";

/**
 * Who may read a magazine issue (ADR-0042). The single source of the issue
 * read rules; `readableIssueWhere` is its query twin, pinned by a parity
 * test. The access union itself is shared with every layer from
 * `@/lib/magazines/access`.
 */
export type { MagazineIssueAccess } from "@/lib/magazines/access";

export type IssueAccessInput = {
  /** The viewer's standing in the issue's magazine (`./editorship`). */
  viewer: MagazineStanding;
  community: (CommunityVisibility & { deleted: boolean }) | null;
  issue: {
    status: IssueStatus;
    visibility: IssueVisibility;
    publicConfirmedAt: string | null;
  };
};

export function resolveMagazineIssueAccess(
  input: IssueAccessInput,
): MagazineIssueAccess {
  const { viewer, community, issue } = input;
  if (community === null || community.deleted) return "none";
  if (viewer.isEditor) return "editor";
  if (issue.status !== "published") return "none";
  if (viewer.isMember) return "full";
  switch (effectiveVisibility(issue, community)) {
    case "members":
      return "none";
    case "teaser":
      return "teaser";
    case "public":
      return "full";
  }
}

export type LoadableIssue = {
  communityId: string;
  /** The issue's magazine (id or populated); null only for a broken row. */
  magazine?: unknown;
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
  issue: Omit<LoadableIssue, "communityId" | "magazine">,
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
  const viewer = community
    ? await loadMagazineEditorship(
        database,
        {
          communityId: issue.communityId,
          magazineId: relationIdOrNull(issue.magazine),
        },
        viewerId,
      )
    : NO_STANDING;

  return resolveMagazineIssueAccess({
    viewer,
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

export type IssueAccessRow = {
  id: number;
  communityId: string;
  magazineId: number | null;
  status: IssueStatus;
  visibility: IssueVisibility;
  publicConfirmedAt: string | null;
};

/** One by-id read of an issue's access facts; null when it is missing. */
export async function loadIssueFactsById(
  deps: Pick<Deps, "payload">,
  issueId: number,
): Promise<IssueAccessRow | null> {
  const issue = await deps.payload.findByID({
    collection: "magazine-issues",
    id: issueId,
    depth: 0,
    disableErrors: true,
    select: {
      communityId: true,
      magazine: true,
      status: true,
      visibility: true,
      publicConfirmedAt: true,
    },
  });
  if (!issue) return null;
  const facts = issueAccessFacts(issue);
  if (!facts) return null;
  return {
    id: Number(issue.id),
    communityId: issue.communityId,
    magazineId: relationIdOrNull(issue.magazine),
    ...facts,
  };
}

/** Read an issue's facts once, then resolve access for the current viewer. */
export async function loadIssueAccessById(
  deps: Pick<Deps, "db" | "payload">,
  issueId: number,
  viewerId: string | null,
): Promise<{ issue: IssueAccessRow; access: MagazineIssueAccess } | null> {
  const issue = await loadIssueFactsById(deps, issueId);
  if (!issue) return null;
  return {
    issue,
    access: await loadMagazineIssueAccess(
      deps.db,
      { ...issue, magazine: issue.magazineId },
      viewerId,
    ),
  };
}

export type IssueAudience = "nobody" | "members" | "preview" | "everyone";

/** Who may be told about a published issue (Decision 8).
 * Preview reaches signed-in subscribers by inbox; email stays public-only.
 */
export function issueAudience(
  community: (CommunityVisibility & { deleted: boolean }) | null,
  issue: IssueAccessInput["issue"],
): IssueAudience {
  const access = resolveMagazineIssueAccess({
    viewer: NO_STANDING,
    community,
    issue,
  });
  switch (access) {
    case "teaser":
      return "preview";
    case "full":
      return "everyone";
    case "editor":
      return "nobody";
    case "none": {
      const access = resolveMagazineIssueAccess({
        viewer: standingOf("member", null),
        community,
        issue,
      });
      switch (access) {
        case "full":
          return "members";
        case "none":
        case "teaser":
        case "editor":
          return "nobody";
      }
      const _exhaustive: never = access;
      return _exhaustive;
    }
  }
  const _exhaustive: never = access;
  return _exhaustive;
}
