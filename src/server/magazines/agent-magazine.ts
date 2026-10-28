import { TRPCError } from "@trpc/server";
import { sql } from "@payloadcms/db-postgres";
import { and, eq, inArray, isNull, or } from "drizzle-orm";

import { routing } from "@/i18n/routing";
import { HUB_SLUG } from "@/server/communities/hub";
import { isContentPublic } from "@/server/communities/content-visibility";
import { agentDrafts, agentProfiles, communities } from "@/server/db/schema";
import {
  authorBylineAtReadTime,
  memberDisplayName,
  memberNamesByUserId,
  withAuthorBylines,
} from "@/server/members/display-name";
import { magazineAgentIssueReviewPath } from "@/lib/magazines/paths";
import type { Article, Magazine, MagazineIssue } from "@/payload-types";

import {
  agentArticleAuthorName,
  articleBodyToLexical,
  magazineArticleCreateData,
  magazineArticlePatch,
} from "./agent-article-body";
import {
  approveAgentIssue,
  rejectAgentIssue,
  submitIssueForReview,
  type AgentIssueDraftStatus,
  type AgentIssueSnapshot,
  type MagazinePublishEffects,
  type MagazineReviewStore,
} from "./agent-magazine-review";
import type { Deps } from "./deps";
import {
  listMagazineEditorIds,
  loadMagazineEditorship,
  standingCan,
} from "./editorship";
import { createIssue, publishIssue } from "./issue-service";
import { placedArticlesOf, syncArticlePlacement } from "./article-placement";
import { uniqueMagazineArticleSlug } from "./magazine-articles";
import { magazineError } from "./errors";
import { itemContextFor } from "./items/context";
import {
  toItemInputs,
  toStoredItems,
  validateIssueItems,
  type IssueItemInput,
} from "./items/registry";
import { listPendingArticles } from "./article-review";
import { findMagazineBySlug } from "./reading";
import {
  loadIssueReadScope,
  readableIssueIds,
  type IssueReadScope,
} from "./readable-issues";
import type { StoredBlock } from "./items/registry";
import { notifyAgentIssueSubmitted } from "./notifications";
import { inPayloadTransaction } from "./payload-writes";
import {
  mergeCommunityMagazineBrowse,
  submissionsAreVisible,
} from "./agent-magazine-browse";
import { articleDocumentId, articleIdForTool } from "./article-document-id";
import { relationIdOrNull, requireRelationId } from "./relation-id";

export const MAGAZINE_ARTICLE_DRAFT_TYPE = "magazine_article";
export const MAGAZINE_ISSUE_DRAFT_TYPE = "magazine_issue";
export const MAGAZINE_BROWSE_LIMIT = 20;
const MAX_ITEMS = 50;

export type MagazineAgent = { agentId: string; ownerId: string };

type DraftMeta = {
  magazineId?: number;
  magazineSlug?: string;
  communityId?: string;
  communitySlug?: string;
  issueId?: number;
  title?: string;
  articleIds?: number[];
  destinationLabel?: string;
  destinationPath?: string;
  slug?: string;
};

type LiveCommunity = {
  id: string;
  slug: string;
  name: string;
  isListedInDirectory: boolean;
  deletedAt: Date | null;
};

function metaOf(value: unknown): DraftMeta {
  if (!value || typeof value !== "object") return {};
  const meta = value as DraftMeta;
  return {
    ...meta,
    articleIds: Array.isArray(meta.articleIds)
      ? meta.articleIds.filter((id) => typeof id === "number")
      : undefined,
  };
}

function issueStatusOf(status: string): AgentIssueSnapshot["issueStatus"] {
  if (status === "draft" || status === "scheduled" || status === "published") {
    return status;
  }
  return "published";
}

function articleIdsOf(issue: MagazineIssue): number[] {
  return placedArticlesOf((issue.items ?? []) as StoredBlock[]).map(
    (item) => item.articleId,
  );
}

async function ownerName(deps: Deps, ownerId: string): Promise<string> {
  return (await memberDisplayName(deps.db, ownerId)) ?? "member";
}

async function liveCommunity(
  deps: Deps,
  communityId: string,
): Promise<LiveCommunity | null> {
  const row = await deps.db.query.communities.findFirst({
    where: and(eq(communities.id, communityId), isNull(communities.deletedAt)),
    columns: {
      id: true,
      slug: true,
      name: true,
      isListedInDirectory: true,
      deletedAt: true,
    },
  });
  return row ?? null;
}

async function requireMagazine(deps: Deps, magazineSlug: string) {
  const magazine = await findMagazineBySlug(deps.payload, magazineSlug);
  if (!magazine) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Magazine not found" });
  }
  const community = await liveCommunity(deps, magazine.communityId);
  if (!community) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Magazine not found" });
  }
  return { magazine, community };
}

function maySeeCommunity(
  community: LiveCommunity,
  scope: IssueReadScope,
): boolean {
  if (community.deletedAt || scope.deletedCommunityIds.includes(community.id)) {
    return false;
  }
  if (scope.editorCommunityIds.includes(community.id)) return true;
  if (scope.memberCommunityIds.includes(community.id)) return true;
  return isContentPublic(community);
}

async function agentTouchesMagazine(
  deps: Deps,
  agentId: string,
  magazineId: number,
): Promise<boolean> {
  const rows = await deps.db
    .select({ metadata: agentDrafts.metadata })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.agentId, agentId),
        inArray(agentDrafts.type, [
          MAGAZINE_ARTICLE_DRAFT_TYPE,
          MAGAZINE_ISSUE_DRAFT_TYPE,
        ]),
        inArray(agentDrafts.status, ["draft", "pending"]),
      ),
    );
  return rows.some((row) => metaOf(row.metadata).magazineId === magazineId);
}

function draftSnapshot(
  row: typeof agentDrafts.$inferSelect,
  issue: MagazineIssue,
  communitySlug: string,
): AgentIssueSnapshot {
  const meta = metaOf(row.metadata);
  return {
    draftId: row.id,
    agentId: row.agentId,
    ownerId: row.ownerId,
    issueId: issue.id,
    magazineId: meta.magazineId ?? requireRelationId(issue.magazine),
    communityId: meta.communityId ?? issue.communityId,
    communitySlug: meta.communitySlug ?? communitySlug,
    title: issue.title,
    status: row.status as AgentIssueDraftStatus,
    issueStatus: issueStatusOf(issue.status),
    articleIds: articleIdsOf(issue),
    updatedAt: issue.updatedAt,
  };
}

function liveStore(deps: Deps): MagazineReviewStore {
  return {
    async loadIssueDraft(agentId, issueId) {
      const [row] = await deps.db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.agentId, agentId),
            eq(agentDrafts.type, MAGAZINE_ISSUE_DRAFT_TYPE),
            eq(agentDrafts.targetId, String(issueId)),
          ),
        )
        .limit(1);
      if (!row) return null;
      const issue = await deps.payload.findByID({
        collection: "magazine-issues",
        id: issueId,
        depth: 0,
        disableErrors: true,
      });
      if (!issue) return null;
      const community = await liveCommunity(deps, issue.communityId);
      return draftSnapshot(row, issue, community?.slug ?? "");
    },
    async loadByDraftId(draftId) {
      const [row] = await deps.db
        .select()
        .from(agentDrafts)
        .where(
          and(
            eq(agentDrafts.id, draftId),
            eq(agentDrafts.type, MAGAZINE_ISSUE_DRAFT_TYPE),
          ),
        )
        .limit(1);
      if (!row?.targetId) return null;
      const issue = await deps.payload.findByID({
        collection: "magazine-issues",
        id: Number(row.targetId),
        depth: 0,
        disableErrors: true,
      });
      if (!issue) return null;
      const community = await liveCommunity(deps, issue.communityId);
      return draftSnapshot(row, issue, community?.slug ?? "");
    },
    async markPending(draftId) {
      await deps.db
        .update(agentDrafts)
        .set({ status: "pending" })
        .where(
          and(eq(agentDrafts.id, draftId), eq(agentDrafts.status, "draft")),
        );
    },
    async markRejected(draftId) {
      await deps.db
        .update(agentDrafts)
        .set({ status: "rejected" })
        .where(
          and(eq(agentDrafts.id, draftId), eq(agentDrafts.status, "pending")),
        );
    },
    async markPublished(draftId) {
      await deps.db
        .update(agentDrafts)
        .set({ status: "published" })
        .where(
          and(eq(agentDrafts.id, draftId), eq(agentDrafts.status, "pending")),
        );
    },
    async approvePlacedArticles(issue) {
      for (const articleId of issue.articleIds) {
        const article = await deps.payload.findByID({
          collection: "articles",
          id: articleId,
          draft: true,
          depth: 0,
          disableErrors: true,
        });
        if (article?.authorId !== issue.ownerId) continue;
        if (article.status === "published") continue;
        if (article.reviewStatus === "approved") continue;
        await deps.payload.update({
          collection: "articles",
          id: articleId,
          draft: article.status === "draft",
          depth: 0,
          data: { reviewStatus: "approved", reviewNote: null },
        });
      }
    },
    async notifyEditors(issue) {
      const magazine = await deps.payload.findByID({
        collection: "magazines",
        id: issue.magazineId,
        depth: 0,
      });
      const editorIds = await listMagazineEditorIds(deps.db, {
        communityId: issue.communityId,
        magazineId: issue.magazineId,
      });
      await notifyAgentIssueSubmitted(deps.db, {
        editorIds,
        ownerId: issue.ownerId,
        authorName: await ownerName(deps, issue.ownerId),
        issueTitle: issue.title,
        draftId: issue.draftId,
        magazineName: magazine.name,
        community: { id: issue.communityId, slug: issue.communitySlug },
      });
    },
  };
}

/**
 * Publishing goes through the magazine issue service, which records the
 * subscriber announcement. This module does not send mail and does not write
 * that announcement itself.
 */
function liveEffects(deps: Deps): MagazinePublishEffects {
  return {
    async publishIssue(snapshot, approverId) {
      const issue = await deps.payload.findByID({
        collection: "magazine-issues",
        id: snapshot.issueId,
        depth: 0,
      });
      const community = await liveCommunity(deps, snapshot.communityId);
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Magazine not found",
        });
      }
      const saved = await publishIssue(deps, issue, issue.updatedAt, {
        userId: approverId,
        community: {
          id: community.id,
          slug: community.slug,
          isListedInDirectory: community.isListedInDirectory,
        },
      });
      return { status: saved.status };
    },
    async recordIssueAnnouncement() {
      throw new Error(
        "Subscriber announcements are recorded only inside publishIssue",
      );
    },
    async deliverSubscriberEmail() {
      throw new Error(
        "Subscriber email is sent by the announcement job after publish",
      );
    },
  };
}

async function approverEdits(
  deps: Deps,
  issue: { communityId: string; magazineId: number },
  userId: string,
): Promise<boolean> {
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: issue.communityId, magazineId: issue.magazineId },
    userId,
  );
  return standingCan(standing, "edit");
}

async function editorFlag(deps: Deps, draftId: string, userId: string) {
  const issue = await liveStore(deps).loadByDraftId(draftId);
  if (!issue) return false;
  return approverEdits(deps, issue, userId);
}

export async function submitAgentIssue(
  deps: Deps,
  identity: MagazineAgent,
  issueId: number,
) {
  return submitIssueForReview(
    liveStore(deps),
    liveEffects(deps),
    identity,
    issueId,
  );
}

export async function approveAgentMagazineIssue(
  deps: Deps,
  approverId: string,
  draftId: string,
) {
  return approveAgentIssue(liveStore(deps), liveEffects(deps), {
    draftId,
    approverId,
    editor: await editorFlag(deps, draftId, approverId),
  });
}

export async function rejectAgentMagazineIssue(
  deps: Deps,
  approverId: string,
  draftId: string,
) {
  return rejectAgentIssue(liveStore(deps), liveEffects(deps), {
    draftId,
    approverId,
    editor: await editorFlag(deps, draftId, approverId),
  });
}

export async function readAgentIssueReview(
  deps: Deps,
  viewerId: string,
  draftId: string,
) {
  const issue = await liveStore(deps).loadByDraftId(draftId);
  if (!issue) return null;
  const editor = await approverEdits(deps, issue, viewerId);
  if (viewerId !== issue.ownerId && !editor) return null;
  const [agent] = await deps.db
    .select({ name: agentProfiles.name })
    .from(agentProfiles)
    .where(eq(agentProfiles.id, issue.agentId))
    .limit(1);
  const magazine = await deps.payload.findByID({
    collection: "magazines",
    id: issue.magazineId,
    depth: 0,
    disableErrors: true,
  });
  return {
    draftId: issue.draftId,
    title: issue.title,
    status: issue.status,
    agentName: agent?.name ?? "Agent",
    magazineName: magazine?.name ?? "",
    communitySlug: issue.communitySlug,
    isEditor: editor,
    canApprove:
      issue.status === "pending" && (editor || viewerId === issue.ownerId),
  };
}

async function articleAuthorName(
  deps: Deps,
  identity: MagazineAgent,
): Promise<string> {
  const human = await ownerName(deps, identity.ownerId);
  const [agent] = await deps.db
    .select({
      name: agentProfiles.name,
      visibilityMode: agentProfiles.visibilityMode,
    })
    .from(agentProfiles)
    .where(eq(agentProfiles.id, identity.agentId))
    .limit(1);
  return agentArticleAuthorName(human, agent ?? null);
}

async function findOwnedDraft(
  deps: Deps,
  agentId: string,
  type: string,
  targetId: string,
) {
  const [row] = await deps.db
    .select()
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.agentId, agentId),
        eq(agentDrafts.type, type),
        eq(agentDrafts.targetId, targetId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function articleHeldForReview(
  deps: Deps,
  agentId: string,
  articleId: number,
): Promise<boolean> {
  const rows = await deps.db
    .select({ metadata: agentDrafts.metadata, status: agentDrafts.status })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.agentId, agentId),
        eq(agentDrafts.type, MAGAZINE_ISSUE_DRAFT_TYPE),
        eq(agentDrafts.status, "pending"),
      ),
    );
  return rows.some((row) =>
    metaOf(row.metadata).articleIds?.includes(articleId),
  );
}

function magazineMeta(
  magazine: Magazine,
  community: LiveCommunity,
  extra: DraftMeta = {},
): DraftMeta {
  return {
    magazineId: magazine.id,
    magazineSlug: magazine.slug,
    communityId: community.id,
    communitySlug: community.slug,
    destinationLabel: `${magazine.name} · editorial review`,
    ...extra,
  };
}

export async function saveMagazineArticle(
  deps: Deps,
  identity: MagazineAgent,
  input: {
    magazineSlug: string;
    articleId?: number;
    title?: string;
    body?: string;
    coverImageUrl?: string | null;
  },
) {
  const { magazine, community } = await requireMagazine(
    deps,
    input.magazineSlug,
  );
  if (input.articleId === undefined) {
    if (!input.title?.trim() || !input.body?.trim()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A new article needs a title and a body.",
      });
    }
    const created = await deps.payload.create({
      collection: "articles",
      draft: true,
      data: magazineArticleCreateData({
        title: input.title.trim(),
        slug: await uniqueMagazineArticleSlug(
          deps.payload,
          magazine.id,
          input.title,
        ),
        body: input.body,
        mediaUrl: input.coverImageUrl,
        authorId: identity.ownerId,
        authorName: await articleAuthorName(deps, identity),
        magazineId: magazine.id,
      }),
    });
    const draftId = crypto.randomUUID();
    await deps.db.insert(agentDrafts).values({
      id: draftId,
      agentId: identity.agentId,
      ownerId: identity.ownerId,
      type: MAGAZINE_ARTICLE_DRAFT_TYPE,
      targetType: "articles",
      targetId: String(created.id),
      status: "draft",
      content: created.title,
      metadata: magazineMeta(magazine, community, {
        title: created.title,
        slug: created.slug,
      }),
    });
    return articleResult(deps, created, null, input.body ?? null);
  }

  const owned = await findOwnedDraft(
    deps,
    identity.agentId,
    MAGAZINE_ARTICLE_DRAFT_TYPE,
    String(input.articleId),
  );
  if (owned?.status !== "draft") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You can only edit your own open article draft.",
    });
  }
  if (await articleHeldForReview(deps, identity.agentId, input.articleId)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This article is in an issue waiting for review.",
    });
  }
  const existing = await deps.payload.findByID({
    collection: "articles",
    id: input.articleId,
    draft: true,
    depth: 0,
  });
  if (
    existing.authorId !== identity.ownerId ||
    relationIdOrNull(existing.magazine) !== magazine.id ||
    existing.status === "published" ||
    existing.reviewStatus === "approved" ||
    existing.reviewStatus === "pending_review" ||
    existing.reviewStatus === "rejected"
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This article can no longer be edited by the agent.",
    });
  }
  const updated = await deps.payload.update({
    collection: "articles",
    id: existing.id,
    draft: true,
    depth: 0,
    data: magazineArticlePatch({
      title: input.title?.trim(),
      body: input.body,
      mediaUrl: input.coverImageUrl,
    }),
  });
  await deps.db
    .update(agentDrafts)
    .set({
      content: updated.title,
      metadata: magazineMeta(magazine, community, {
        title: updated.title,
        slug: updated.slug,
      }),
    })
    .where(eq(agentDrafts.id, owned.id));
  return articleResult(
    deps,
    updated,
    existing.reviewStatus ?? null,
    input.body ?? null,
    input.articleId,
  );
}

async function mainArticleIdsBySlug(
  deps: Deps,
  slugs: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(slugs.filter((slug) => slug.length > 0))];
  const ids = new Map<string, number>();
  if (unique.length === 0) return ids;
  const { docs } = await deps.payload.find({
    collection: "articles",
    where: { slug: { in: unique } },
    // The collection table, not `_articles_v`. This id is the integer agents
    // pass back as articleId.
    draft: false,
    depth: 0,
    pagination: false,
    limit: unique.length,
    select: { slug: true },
  });
  for (const doc of docs) {
    const id = articleDocumentId(doc.id);
    if (id !== null) ids.set(doc.slug, id);
  }
  return ids;
}

async function articleResult(
  deps: Deps,
  article: Article,
  reviewStatus: string | null,
  body: string | null,
  fallbackId?: number,
) {
  const bySlug = await mainArticleIdsBySlug(deps, [article.slug]);
  const articleId =
    articleIdForTool(article, bySlug) ?? articleDocumentId(fallbackId);
  if (articleId === null) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "The article was saved but its id could not be read back.",
    });
  }
  return {
    articleId,
    slug: article.slug,
    title: article.title,
    status: "draft" as const,
    reviewStatus,
    mediaUrl: article.mediaUrl ?? null,
    updatedAt: article.updatedAt,
    body,
  };
}

async function assertPlaceable(
  deps: Deps,
  identity: MagazineAgent,
  magazineId: number,
  issueId: number,
  articleIds: number[],
) {
  if (articleIds.length > MAX_ITEMS) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `An issue holds at most ${MAX_ITEMS} articles.`,
    });
  }
  if (new Set(articleIds).size !== articleIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Each article can appear once in the issue.",
    });
  }
  if (articleIds.length === 0) return;
  const { docs } = await deps.payload.find({
    collection: "articles",
    where: { id: { in: articleIds } },
    draft: true,
    depth: 0,
    limit: articleIds.length,
    pagination: false,
  });
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const ownedRows = await deps.db
    .select({ targetId: agentDrafts.targetId, status: agentDrafts.status })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.agentId, identity.agentId),
        eq(agentDrafts.type, MAGAZINE_ARTICLE_DRAFT_TYPE),
        inArray(agentDrafts.targetId, articleIds.map(String)),
      ),
    );
  const owned = new Set(
    ownedRows
      .filter((row) => row.status === "draft" || row.status === "pending")
      .map((row) => Number(row.targetId)),
  );
  for (const articleId of articleIds) {
    const article = byId.get(articleId);
    if (!article || relationIdOrNull(article.magazine) !== magazineId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Article ${articleId} is not in this magazine.`,
      });
    }
    const placed = relationIdOrNull(article.magazineIssue);
    if (placed !== null && placed !== issueId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Article ${articleId} is already in another issue.`,
      });
    }
    const ownDraft =
      owned.has(articleId) &&
      article.authorId === identity.ownerId &&
      article.status !== "published" &&
      article.reviewStatus !== "approved";
    if (article.reviewStatus !== "approved" && !ownDraft) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Article ${articleId} is not ready to place. Use your own draft or an approved article.`,
      });
    }
  }
}

function editorNoteOf(note: unknown): MagazineIssue["editorNote"] | null {
  if (note == null) return null;
  if (typeof note === "string") {
    const trimmed = note.trim();
    if (!trimmed) return null;
    return articleBodyToLexical(trimmed) as MagazineIssue["editorNote"];
  }
  return note as MagazineIssue["editorNote"];
}

/** Text sections may be sent as plain text; the issue stores the editor's Lexical shape. */
function agentIssueItems(items: IssueItemInput[]): IssueItemInput[] {
  return items.map((item) =>
    item.kind === "editorial" && typeof item.body === "string"
      ? { ...item, body: articleBodyToLexical(item.body) }
      : item,
  );
}

async function writeDraftIssue(
  deps: Deps,
  issue: MagazineIssue,
  expectedUpdatedAt: string,
  patch: {
    title?: string;
    coverImageUrl?: string | null;
    articleIds?: number[];
    blocks?: StoredBlock[];
    editorNote?: MagazineIssue["editorNote"] | null;
  },
) {
  if (issue.status !== "draft") {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Only a draft issue can be edited.",
    });
  }
  const data: {
    title?: string;
    coverImageUrl?: string | null;
    items?: MagazineIssue["items"];
    editorNote?: MagazineIssue["editorNote"];
  } = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.coverImageUrl !== undefined)
    data.coverImageUrl = patch.coverImageUrl;
  if (patch.editorNote !== undefined) data.editorNote = patch.editorNote;
  let blocks: StoredBlock[] | null = null;
  if (patch.blocks !== undefined) {
    blocks = patch.blocks;
    data.items = blocks as MagazineIssue["items"];
  } else if (patch.articleIds !== undefined) {
    const current = (issue.items ?? []) as StoredBlock[];
    const idByArticle = new Map<number, string>();
    for (const block of current) {
      if (block.blockType !== "article" || !block.id) continue;
      const articleId = relationIdOrNull(block.article);
      if (articleId !== null) idByArticle.set(articleId, block.id);
    }
    blocks = toStoredItems(
      patch.articleIds.map((articleId) => ({
        kind: "article" as const,
        articleId,
        ...(idByArticle.has(articleId)
          ? { id: idByArticle.get(articleId) }
          : {}),
      })),
    );
    data.items = blocks as MagazineIssue["items"];
  }
  if (Object.keys(data).length === 0) return issue;
  const expected = new Date(expectedUpdatedAt).toISOString();
  try {
    return await inPayloadTransaction(deps.payload, async (tx) => {
      const claimed = await tx.execute(sql`
        UPDATE "magazine_issues" SET "updated_at" = "updated_at"
        WHERE "id" = ${issue.id}
          AND "updated_at" = ${expected}::timestamptz
          AND "status" = 'draft'
        RETURNING "id"
      `);
      if (claimed.length === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "The issue changed. Read it again and retry with the new updatedAt.",
        });
      }
      if (blocks) {
        await syncArticlePlacement(
          deps.payload,
          tx,
          issue.id,
          placedArticlesOf(blocks),
        );
      }
      return deps.payload.update({
        collection: "magazine-issues",
        id: issue.id,
        depth: 0,
        req: tx.req,
        data,
      });
    });
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({
      code: "CONFLICT",
      message: "The issue could not be saved. Read it again and retry.",
    });
  }
}

export async function saveMagazineIssue(
  deps: Deps,
  identity: MagazineAgent,
  input: {
    magazineSlug: string;
    issueId?: number;
    title?: string;
    coverImageUrl?: string | null;
    articleIds?: number[];
    items?: IssueItemInput[];
    editorNote?: unknown;
    expectedUpdatedAt?: string;
  },
) {
  const { magazine, community } = await requireMagazine(
    deps,
    input.magazineSlug,
  );
  const actor = {
    userId: identity.ownerId,
    community: {
      id: community.id,
      slug: community.slug,
      isListedInDirectory: community.isListedInDirectory,
    },
  };
  if (input.items && input.articleIds) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Send items or articleIds, not both.",
    });
  }
  let blocks: StoredBlock[] | undefined;
  if (input.items) {
    blocks = toStoredItems(agentIssueItems(input.items));
  }
  const editorNote =
    input.editorNote === undefined ? undefined : editorNoteOf(input.editorNote);

  const validateBlocks = async (
    issueId: number | null,
    previous: readonly StoredBlock[],
  ) => {
    if (input.articleIds && !input.items) {
      await assertPlaceable(
        deps,
        identity,
        magazine.id,
        issueId ?? -1,
        input.articleIds,
      );
    }
    if (!input.items || !blocks) return;
    const ctx = itemContextFor(deps, {
      magazineId: magazine.id,
      community: actor.community,
      issueId,
      locale: routing.defaultLocale,
      access: "editor",
      viewerId: identity.ownerId,
    });
    const [problem] = await validateIssueItems(blocks, ctx, previous);
    if (problem) {
      throw magazineError(problem.code, { itemIndex: problem.itemIndex });
    }
  };

  let issue: MagazineIssue;
  let draft = input.issueId
    ? await findOwnedDraft(
        deps,
        identity.agentId,
        MAGAZINE_ISSUE_DRAFT_TYPE,
        String(input.issueId),
      )
    : null;
  if (input.issueId === undefined) {
    if (!input.title?.trim()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A new issue needs a title.",
      });
    }
    // Refuse unready articles before any issue row exists.
    await validateBlocks(null, []);
    issue = await createIssue(
      deps,
      magazine,
      { title: input.title.trim() },
      actor,
      {
        afterWrite: async (tx, written) => {
          const data: {
            items?: MagazineIssue["items"];
            coverImageUrl?: string | null;
            editorNote?: MagazineIssue["editorNote"];
          } = {};
          const stored =
            blocks ??
            (input.articleIds
              ? toStoredItems(
                  input.articleIds.map((articleId) => ({
                    kind: "article" as const,
                    articleId,
                  })),
                )
              : undefined);
          if (stored) {
            await syncArticlePlacement(
              deps.payload,
              tx,
              written.id,
              placedArticlesOf(stored),
            );
            data.items = stored as MagazineIssue["items"];
          }
          if (input.coverImageUrl !== undefined) {
            data.coverImageUrl = input.coverImageUrl;
          }
          if (editorNote !== undefined) data.editorNote = editorNote;
          if (Object.keys(data).length === 0) return;
          const updated = await deps.payload.update({
            collection: "magazine-issues",
            id: written.id,
            depth: 0,
            req: tx.req,
            data,
          });
          Object.assign(written, updated);
        },
      },
    );
    const draftId = crypto.randomUUID();
    await deps.db.insert(agentDrafts).values({
      id: draftId,
      agentId: identity.agentId,
      ownerId: identity.ownerId,
      type: MAGAZINE_ISSUE_DRAFT_TYPE,
      targetType: "magazine-issues",
      targetId: String(issue.id),
      status: "draft",
      content: issue.title,
      metadata: magazineMeta(magazine, community, {
        issueId: issue.id,
        title: issue.title,
        slug: issue.slug,
        articleIds: [],
        destinationPath: magazineAgentIssueReviewPath(community.slug, draftId),
      }),
    });
    draft = await findOwnedDraft(
      deps,
      identity.agentId,
      MAGAZINE_ISSUE_DRAFT_TYPE,
      String(issue.id),
    );
  } else {
    if (draft?.status !== "draft") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only edit your own open issue draft.",
      });
    }
    if (!input.expectedUpdatedAt) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Send the issue's updatedAt when you edit it.",
      });
    }
    const loaded = await deps.payload.findByID({
      collection: "magazine-issues",
      id: input.issueId,
      depth: 0,
    });
    if (requireRelationId(loaded.magazine) !== magazine.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found" });
    }
    issue = loaded;
    await validateBlocks(issue.id, (issue.items ?? []) as StoredBlock[]);
  }
  const written =
    input.issueId === undefined
      ? issue
      : await writeDraftIssue(
          deps,
          issue,
          input.issueId === undefined
            ? issue.updatedAt
            : input.expectedUpdatedAt!,
          {
            title:
              input.issueId === undefined ? undefined : input.title?.trim(),
            coverImageUrl: input.coverImageUrl,
            articleIds: input.articleIds,
            blocks,
            editorNote:
              input.editorNote === undefined
                ? undefined
                : editorNoteOf(input.editorNote),
          },
        );
  const articleIds = articleIdsOf(written);
  if (draft) {
    await deps.db
      .update(agentDrafts)
      .set({
        content: written.title,
        metadata: magazineMeta(magazine, community, {
          issueId: written.id,
          title: written.title,
          slug: written.slug,
          articleIds,
          destinationPath: magazineAgentIssueReviewPath(
            community.slug,
            draft.id,
          ),
        }),
      })
      .where(eq(agentDrafts.id, draft.id));
  }
  return {
    issueId: written.id,
    slug: written.slug,
    number: Number(written.number),
    title: written.title,
    status: "draft" as const,
    coverImageUrl: written.coverImageUrl ?? null,
    editorNote: written.editorNote ?? null,
    articleIds,
    items: toItemInputs((written.items ?? []) as StoredBlock[]),
    updatedAt: written.updatedAt,
    body: written.title,
    review: "draft" as const,
  };
}

export async function browseMagazines(
  deps: Deps,
  viewer: { agentId: string; ownerId: string | null },
  input: { magazineSlug?: string; communitySlug?: string; page?: number },
) {
  const page = input.page ?? 1;
  const scope = await loadIssueReadScope(deps.db, viewer.ownerId);
  const yourDrafts = await listAgentDrafts(deps, viewer.agentId);
  if (!input.magazineSlug) {
    const magazines = await listVisibleMagazines(
      deps,
      scope,
      input.communitySlug,
      page,
    );
    // A directory of many communities has no single submission queue.
    // Naming a community loads that community's magazines, including issues.
    if (!input.communitySlug || magazines.length === 0) {
      return {
        magazines,
        page,
        issues: [],
        articles: [],
        submissions: [],
        submissionsVisible: false,
        yourDrafts,
      };
    }
    const editor = magazines.some((magazine) =>
      scope.editorCommunityIds.includes(magazine.communityId),
    );
    const submissionsVisible = submissionsAreVisible(editor, viewer.ownerId);
    const details = [];
    for (const magazine of [...magazines].sort((a, b) => a.id - b.id)) {
      details.push(
        await browseOneMagazine(
          deps,
          scope,
          viewer,
          yourDrafts,
          magazine.slug,
          page,
        ),
      );
    }
    return mergeCommunityMagazineBrowse({
      magazines,
      details,
      page,
      yourDrafts,
      submissionsVisible,
    });
  }
  return browseOneMagazine(
    deps,
    scope,
    viewer,
    yourDrafts,
    input.magazineSlug,
    page,
  );
}

async function browseOneMagazine(
  deps: Deps,
  scope: IssueReadScope,
  viewer: { agentId: string; ownerId: string | null },
  yourDrafts: Awaited<ReturnType<typeof listAgentDrafts>>,
  magazineSlug: string,
  page: number,
) {
  const { magazine, community } = await requireMagazine(deps, magazineSlug);
  const visible =
    maySeeCommunity(community, scope) ||
    (await agentTouchesMagazine(deps, viewer.agentId, magazine.id));
  if (!visible) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Magazine not found" });
  }
  const editor = scope.editorCommunityIds.includes(community.id);
  const submissionsVisible = submissionsAreVisible(editor, viewer.ownerId);
  const [issues, articles, submissions] = await Promise.all([
    listIssues(deps, scope, magazine, yourDrafts),
    listArticles(deps, scope, magazine, viewer),
    listSubmissionItems(deps, magazine, viewer.ownerId, editor),
  ]);
  return {
    magazines: [magazineSummary(magazine)],
    page,
    issues,
    articles,
    submissions,
    submissionsVisible,
    yourDrafts: yourDrafts.filter(
      (draft) => draft.magazineSlug === magazine.slug,
    ),
  };
}

function magazineSummary(magazine: Magazine) {
  return {
    id: magazine.id,
    slug: magazine.slug,
    name: magazine.name,
    communityId: magazine.communityId,
    description: magazine.description ?? null,
  };
}

async function listVisibleMagazines(
  deps: Deps,
  scope: IssueReadScope,
  communitySlug: string | undefined,
  page: number,
) {
  const listed = await deps.db
    .select({ id: communities.id, slug: communities.slug })
    .from(communities)
    .where(
      and(
        isNull(communities.deletedAt),
        or(
          eq(communities.isListedInDirectory, true),
          eq(communities.slug, HUB_SLUG),
        ),
      ),
    );
  let ids = [
    ...new Set([
      ...listed.map((row) => row.id),
      ...scope.memberCommunityIds,
      ...scope.editorCommunityIds,
    ]),
  ].filter((id) => !scope.deletedCommunityIds.includes(id));
  if (communitySlug) {
    const match = await deps.db.query.communities.findFirst({
      where: and(
        eq(communities.slug, communitySlug),
        isNull(communities.deletedAt),
      ),
      columns: {
        id: true,
        slug: true,
        name: true,
        isListedInDirectory: true,
        deletedAt: true,
      },
    });
    if (!match || !maySeeCommunity(match, scope)) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Community not found",
      });
    }
    ids = ids.filter((id) => id === match.id);
  }
  if (ids.length === 0) return [];
  const result = await deps.payload.find({
    collection: "magazines",
    where: { communityId: { in: ids } },
    sort: "name",
    page,
    limit: MAGAZINE_BROWSE_LIMIT,
    depth: 0,
  });
  return result.docs.map(magazineSummary);
}

async function listAgentDrafts(deps: Deps, agentId: string) {
  const rows = await deps.db
    .select()
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.agentId, agentId),
        inArray(agentDrafts.type, [
          MAGAZINE_ARTICLE_DRAFT_TYPE,
          MAGAZINE_ISSUE_DRAFT_TYPE,
        ]),
        inArray(agentDrafts.status, ["draft", "pending"]),
      ),
    )
    .limit(MAX_ITEMS);
  return rows.flatMap((row) => {
    const meta = metaOf(row.metadata);
    const id = Number(row.targetId);
    if (!Number.isInteger(id) || !meta.magazineSlug) return [];
    return [
      {
        kind:
          row.type === MAGAZINE_ISSUE_DRAFT_TYPE
            ? ("issue" as const)
            : ("article" as const),
        id,
        draftId: row.id,
        title: row.content,
        magazineSlug: meta.magazineSlug,
        status: row.status,
      },
    ];
  });
}

async function listIssues(
  deps: Deps,
  scope: IssueReadScope,
  magazine: Magazine,
  yourDrafts: Awaited<ReturnType<typeof listAgentDrafts>>,
) {
  const ids = await readableIssueIds(deps.payload, scope, "teaser", {
    magazine: { equals: magazine.id },
  });
  const ownIds = yourDrafts
    .filter((draft) => draft.kind === "issue")
    .map((draft) => draft.id);
  const wanted = [...new Set([...ids, ...ownIds])];
  if (wanted.length === 0) return [];
  const { docs } = await deps.payload.find({
    collection: "magazine-issues",
    where: {
      and: [{ magazine: { equals: magazine.id } }, { id: { in: wanted } }],
    },
    sort: "-number",
    depth: 0,
    limit: MAX_ITEMS,
    pagination: false,
  });
  const reviewByIssue = new Map(
    yourDrafts
      .filter((draft) => draft.kind === "issue")
      .map((draft) => [draft.id, draft.status]),
  );
  return docs
    .map((issue) =>
      presentBrowsedIssue(
        issue,
        reviewByIssue.get(issue.id) === "pending"
          ? "pending"
          : reviewByIssue.get(issue.id) === "draft"
            ? "draft"
            : null,
      ),
    )
    .sort((a, b) => b.number - a.number || a.id - b.id);
}

/** One issue in browse-magazines. `updatedAt` is what save-magazine-issue sends back. */
export function presentBrowsedIssue(
  issue: MagazineIssue,
  agentReview: "pending" | "draft" | null,
) {
  return {
    id: issue.id,
    number: Number(issue.number),
    title: issue.title,
    slug: issue.slug,
    status: issue.status,
    visibility: issue.visibility,
    coverImageUrl: issue.coverImageUrl ?? null,
    publishedAt: issue.publishedAt ?? null,
    articleIds: articleIdsOf(issue),
    updatedAt: issue.updatedAt,
    agentReview,
  };
}

async function listArticles(
  deps: Deps,
  scope: IssueReadScope,
  magazine: Magazine,
  viewer: { agentId: string; ownerId: string | null },
) {
  const issueIds = await readableIssueIds(deps.payload, scope, "full", {
    magazine: { equals: magazine.id },
  });
  const published =
    issueIds.length === 0
      ? []
      : (
          await deps.payload.find({
            collection: "articles",
            where: {
              and: [
                { magazine: { equals: magazine.id } },
                { status: { equals: "published" } },
                { magazineIssue: { in: issueIds } },
              ],
            },
            sort: "id",
            depth: 0,
            limit: MAX_ITEMS,
            pagination: false,
          })
        ).docs;
  const own = await deps.db
    .select({ targetId: agentDrafts.targetId })
    .from(agentDrafts)
    .where(
      and(
        eq(agentDrafts.agentId, viewer.agentId),
        eq(agentDrafts.type, MAGAZINE_ARTICLE_DRAFT_TYPE),
        inArray(agentDrafts.status, ["draft", "pending"]),
      ),
    );
  const ownIds = own
    .map((row) => Number(row.targetId))
    .filter(
      (id) => Number.isInteger(id) && !published.some((doc) => doc.id === id),
    );
  const drafts =
    ownIds.length === 0
      ? []
      : (
          await deps.payload.find({
            collection: "articles",
            where: {
              and: [
                { id: { in: ownIds } },
                { magazine: { equals: magazine.id } },
              ],
            },
            draft: true,
            sort: "slug",
            depth: 0,
            limit: ownIds.length,
            pagination: false,
          })
        ).docs;
  const presentedDrafts = await presentArticles(deps, drafts);
  const publishedNames = await liveAuthorNames(deps, published);
  const presentedPublished = published.flatMap((doc) => {
    const id = articleDocumentId(doc.id);
    if (id === null) return [];
    return [
      articleSummary(
        { ...doc, id },
        authorBylineAtReadTime(
          doc.authorName,
          doc.authorId ? (publishedNames.get(doc.authorId) ?? null) : null,
        ),
      ),
    ];
  });
  const seen = new Set(presentedPublished.map((article) => article.id));
  return [
    ...presentedPublished,
    ...presentedDrafts.filter((article) => !seen.has(article.id)),
  ].sort((a, b) => a.id - b.id);
}

async function presentArticles(deps: Deps, docs: Article[]) {
  const bySlug = await mainArticleIdsBySlug(
    deps,
    docs.map((doc) => doc.slug),
  );
  const names = await liveAuthorNames(deps, docs);
  const presented = [];
  for (const doc of docs) {
    const id = articleIdForTool(doc, bySlug);
    if (id === null) continue;
    presented.push(
      articleSummary(
        { ...doc, id },
        authorBylineAtReadTime(
          doc.authorName,
          doc.authorId ? (names.get(doc.authorId) ?? null) : null,
        ),
      ),
    );
  }
  return presented;
}

async function liveAuthorNames(deps: Deps, articles: readonly Article[]) {
  return memberNamesByUserId(
    deps.db,
    articles
      .map((article) => article.authorId)
      .filter((id): id is string => Boolean(id)),
  );
}

function articleSummary(article: Article, authorName: string | null) {
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    status: article.status,
    reviewStatus: article.reviewStatus ?? null,
    mediaUrl: article.mediaUrl ?? null,
    authorName,
  };
}

async function listSubmissionItems(
  deps: Deps,
  magazine: Magazine,
  ownerId: string | null,
  editor: boolean,
) {
  if (!submissionsAreVisible(editor, ownerId)) return [];
  if (editor) {
    return presentSubmissionItems(
      deps,
      await withAuthorBylines(
        deps.db,
        await listPendingArticles(deps.payload, magazine.id),
      ),
    );
  }
  const { docs } = await deps.payload.find({
    collection: "articles",
    where: {
      and: [
        { magazine: { equals: magazine.id } },
        { authorId: { equals: ownerId } },
        { authorType: { equals: "member" } },
        { reviewStatus: { equals: "pending_review" } },
      ],
    },
    draft: true,
    sort: "slug",
    depth: 0,
    limit: MAX_ITEMS,
    pagination: false,
  });
  return presentSubmissionItems(
    deps,
    await withAuthorBylines(
      deps.db,
      docs.map((doc) => ({
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        authorId: doc.authorId ?? null,
        authorName: doc.authorName ?? null,
        sentAt: doc.updatedAt,
      })),
    ),
  );
}

async function presentSubmissionItems<T extends { id: unknown; slug: string }>(
  deps: Deps,
  items: T[],
) {
  const bySlug = await mainArticleIdsBySlug(
    deps,
    items.map((item) => item.slug),
  );
  const presented = [];
  const seen = new Set<number>();
  for (const item of items) {
    const id = articleIdForTool(item, bySlug);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    presented.push({ ...item, id });
  }
  return presented.sort((a, b) => a.id - b.id || a.slug.localeCompare(b.slug));
}
