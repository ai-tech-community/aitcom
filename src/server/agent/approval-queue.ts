import { and, desc, eq, isNull, ne } from "drizzle-orm";

import { storylineDraftReviewPath } from "@/lib/news/storyline-draft-review";
import type { db } from "@/server/db";
import {
  agentDrafts,
  agentProfiles,
  communities,
  communityMemberships,
} from "@/server/db/schema";

export type ApprovalDraftRow = {
  id: string;
  type: string;
  ownerId: string;
  content: string | null;
  metadata: unknown;
  targetType: string | null;
  targetId: string | null;
};

export type ApprovalQueueItem = {
  id: string;
  type: string;
  kind: string;
  title: string;
  agentName: string;
  reviewPath: string;
};

const KIND_LABEL: Record<string, string> = {
  news_storyline: "STORY",
  thread_create: "THREAD",
  classroom_course: "COURSE",
  classroom_course_update: "COURSE",
  classroom_module: "MODULE",
  classroom_lesson: "LESSON",
  magazine_issue: "ISSUE",
  magazine_article: "ARTICLE",
  magazine_article_update: "ARTICLE",
  feed_post: "FEED",
  feed_comment: "FEED",
  thread_reply: "REPLY",
};

export function approvalKindLabel(type: string): string {
  return KIND_LABEL[type] ?? type.replaceAll("_", " ").toUpperCase();
}

function metaRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function metaString(
  meta: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = meta[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Community this draft belongs to, from the row or its destination path. */
export function draftCommunityRef(draft: {
  metadata: unknown;
  targetType: string | null;
  targetId: string | null;
}): { id?: string; slug?: string } {
  const meta = metaRecord(draft.metadata);
  const slugFromPath = metaString(meta, "destinationPath")?.match(
    /^\/communities\/([^/]+)\//,
  )?.[1];
  const targetId =
    draft.targetType === "community" && draft.targetId
      ? draft.targetId
      : undefined;
  return {
    id: metaString(meta, "communityId") ?? targetId,
    slug: metaString(meta, "communitySlug") ?? slugFromPath,
  };
}

export function viewerMayReviewDraft(input: {
  viewerId: string;
  newsStaff: boolean;
  ownedCommunityIds: ReadonlySet<string>;
  ownedCommunitySlugs: ReadonlySet<string>;
  draft: ApprovalDraftRow;
}): boolean {
  const { draft } = input;
  if (draft.type === "ritual_suggestion") return false;
  if (draft.ownerId === input.viewerId) return true;
  if (draft.type === "news_storyline") return input.newsStaff;
  const community = draftCommunityRef(draft);
  if (community.id && input.ownedCommunityIds.has(community.id)) return true;
  if (community.slug && input.ownedCommunitySlugs.has(community.slug)) {
    return true;
  }
  return false;
}

/** Where the human reviews this draft. Magazine issues keep their publish page. */
export function approvalReviewPath(draft: ApprovalDraftRow): string {
  if (draft.type === "news_storyline") {
    return storylineDraftReviewPath(draft.id);
  }
  if (draft.type === "magazine_issue") {
    const path = metaString(metaRecord(draft.metadata), "destinationPath");
    if (path?.startsWith("/")) return path;
  }
  return storylineDraftReviewPath(draft.id);
}

function draftTitle(draft: ApprovalDraftRow): string {
  const meta = metaRecord(draft.metadata);
  return (
    metaString(meta, "title") ??
    metaString(meta, "threadTitle") ??
    draft.content?.split("\n")[0]?.slice(0, 200) ??
    "Draft"
  );
}

export function presentApprovalDraft(
  draft: ApprovalDraftRow & { agentName: string | null },
): ApprovalQueueItem {
  return {
    id: draft.id,
    type: draft.type,
    kind: approvalKindLabel(draft.type),
    title: draftTitle(draft),
    agentName: draft.agentName?.trim() ? draft.agentName.trim() : "Agent",
    reviewPath: approvalReviewPath(draft),
  };
}

type Database = typeof db;

export async function listApprovalQueue(
  database: Database,
  viewer: { id: string; newsStaff: boolean },
): Promise<ApprovalQueueItem[]> {
  const owned = await database
    .select({ id: communities.id, slug: communities.slug })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communities.id, communityMemberships.communityId),
    )
    .where(
      and(
        eq(communityMemberships.userId, viewer.id),
        eq(communityMemberships.status, "active"),
        eq(communityMemberships.role, "owner"),
        isNull(communities.deletedAt),
      ),
    );
  const rows = await database
    .select({
      id: agentDrafts.id,
      type: agentDrafts.type,
      ownerId: agentDrafts.ownerId,
      content: agentDrafts.content,
      metadata: agentDrafts.metadata,
      targetType: agentDrafts.targetType,
      targetId: agentDrafts.targetId,
      agentName: agentProfiles.name,
    })
    .from(agentDrafts)
    .leftJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .where(
      and(
        eq(agentDrafts.status, "pending"),
        ne(agentDrafts.type, "ritual_suggestion"),
      ),
    )
    .orderBy(desc(agentDrafts.createdAt), agentDrafts.id);
  const ownedCommunityIds = new Set(owned.map((row) => row.id));
  const ownedCommunitySlugs = new Set(owned.map((row) => row.slug));
  return rows
    .filter((row) =>
      viewerMayReviewDraft({
        viewerId: viewer.id,
        newsStaff: viewer.newsStaff,
        ownedCommunityIds,
        ownedCommunitySlugs,
        draft: row,
      }),
    )
    .map(presentApprovalDraft);
}

export type DraftReviewView = {
  id: string;
  type: string;
  kind: string;
  title: string;
  body: string;
  agentName: string;
  destinationLabel: string | null;
  destinationPath: string | null;
  /** Magazine issues publish from their own review page. */
  publishesOnThisPage: boolean;
};

export async function loadDraftReview(
  database: Database,
  draftId: string,
  viewer: { id: string; newsStaff: boolean },
): Promise<DraftReviewView | null> {
  const [row] = await database
    .select({
      id: agentDrafts.id,
      type: agentDrafts.type,
      ownerId: agentDrafts.ownerId,
      content: agentDrafts.content,
      metadata: agentDrafts.metadata,
      targetType: agentDrafts.targetType,
      targetId: agentDrafts.targetId,
      status: agentDrafts.status,
      agentName: agentProfiles.name,
    })
    .from(agentDrafts)
    .leftJoin(agentProfiles, eq(agentProfiles.id, agentDrafts.agentId))
    .where(eq(agentDrafts.id, draftId))
    .limit(1);
  if (
    !row ||
    row.type === "news_storyline" ||
    row.type === "ritual_suggestion"
  ) {
    return null;
  }
  if (row.status !== "pending") return null;
  const owned = await database
    .select({ id: communities.id, slug: communities.slug })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communities.id, communityMemberships.communityId),
    )
    .where(
      and(
        eq(communityMemberships.userId, viewer.id),
        eq(communityMemberships.status, "active"),
        eq(communityMemberships.role, "owner"),
        isNull(communities.deletedAt),
      ),
    );
  const allowed = viewerMayReviewDraft({
    viewerId: viewer.id,
    newsStaff: viewer.newsStaff,
    ownedCommunityIds: new Set(owned.map((community) => community.id)),
    ownedCommunitySlugs: new Set(owned.map((community) => community.slug)),
    draft: row,
  });
  if (!allowed) return null;
  const meta = metaRecord(row.metadata);
  return {
    id: row.id,
    type: row.type,
    kind: approvalKindLabel(row.type),
    title: draftTitle(row),
    body: row.content ?? "",
    agentName: row.agentName?.trim() ? row.agentName.trim() : "Agent",
    destinationLabel: metaString(meta, "destinationLabel") ?? null,
    destinationPath: metaString(meta, "destinationPath") ?? null,
    publishesOnThisPage: row.type !== "magazine_issue",
  };
}

/** True when the viewer owns the draft's community. News storylines stay on their own review. */
export async function communityOwnerMayReview(
  database: Database,
  viewerId: string,
  draft: ApprovalDraftRow,
): Promise<boolean> {
  if (draft.type === "news_storyline" || draft.type === "ritual_suggestion") {
    return false;
  }
  if (draft.ownerId === viewerId) return true;
  const owned = await database
    .select({ id: communities.id, slug: communities.slug })
    .from(communityMemberships)
    .innerJoin(
      communities,
      eq(communities.id, communityMemberships.communityId),
    )
    .where(
      and(
        eq(communityMemberships.userId, viewerId),
        eq(communityMemberships.status, "active"),
        eq(communityMemberships.role, "owner"),
        isNull(communities.deletedAt),
      ),
    );
  return viewerMayReviewDraft({
    viewerId,
    newsStaff: false,
    ownedCommunityIds: new Set(owned.map((community) => community.id)),
    ownedCommunitySlugs: new Set(owned.map((community) => community.slug)),
    draft,
  });
}
