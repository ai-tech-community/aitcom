import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import type { Where } from "payload";

import type { Article, Magazine } from "@/payload-types";
import { communities } from "@/server/db/schema";

import type { Deps, PayloadClient } from "./deps";
import { loadMagazineEditorship } from "./editorship";
import { getMagazineForCommunity } from "./magazine-service";
import { relationIdOrNull } from "./relation-id";

/**
 * Magazine articles from the editor's side (ADR-0043): who may write them,
 * and the editor lists of them. These lists are editor surfaces, never
 * reader surfaces: they show drafts and unpublished articles on purpose.
 */

/** An approved article an editor can still place in an issue. */
export type AvailableMagazineArticle = {
  id: number;
  slug: string;
  title: string;
  authorName: string | null;
  updatedAt: string;
  /**
   * Whether the viewer may open it in the article editor: the edit page's
   * gate (`loadMagazineArticleForEditing`) beyond editorship, which every
   * caller of this list already has: the viewer wrote it.
   */
  editableByViewer: boolean;
};

/** One of the editor's own magazine articles that is not ready yet. */
export type DraftMagazineArticle = {
  id: number;
  slug: string;
  title: string;
  reviewStatus: string | null;
  updatedAt: string;
};

/** Most articles an editor list returns. */
const EDITOR_LIST_LIMIT = 100;

/** Whether the community exists and is not soft-deleted. */
async function isLiveCommunity(
  database: Deps["db"],
  communityId: string,
): Promise<boolean> {
  const community = await database.query.communities.findFirst({
    where: and(eq(communities.id, communityId), isNull(communities.deletedAt)),
    columns: { id: true },
  });
  return community !== undefined;
}

/**
 * The magazine and whether the user edits it (the editorship seam, on a
 * live community). Null when the magazine does not exist. The one editor
 * check for magazine articles.
 */
async function loadMagazineEditing(
  deps: Deps,
  magazine: unknown,
  userId: string | null,
): Promise<{ magazine: Magazine; isEditor: boolean } | null> {
  const magazineId = relationIdOrNull(magazine);
  const doc =
    magazineId === null
      ? null
      : await deps.payload.findByID({
          collection: "magazines",
          id: magazineId,
          depth: 0,
          disableErrors: true,
        });
  if (!doc) return null;
  if (!(await isLiveCommunity(deps.db, doc.communityId))) {
    return { magazine: doc, isEditor: false };
  }
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: doc.communityId, magazineId: doc.id },
    userId,
  );
  return { magazine: doc, isEditor: standing.isEditor };
}

/**
 * The magazine a user writes for, when they are an editor of its
 * community. `NOT_FOUND` when the magazine does not exist, `FORBIDDEN`
 * when the user is not its editor. The one gate for writing magazine
 * articles.
 */
export async function requireEditorOfMagazine(
  deps: Deps,
  magazine: unknown,
  userId: string,
): Promise<Magazine> {
  const editing = await loadMagazineEditing(deps, magazine, userId);
  if (!editing) throw new TRPCError({ code: "NOT_FOUND" });
  if (!editing.isEditor) throw new TRPCError({ code: "FORBIDDEN" });
  return editing.magazine;
}

/** Whether the viewer edits this magazine; false for a missing magazine. */
export async function isEditorOfMagazine(
  deps: Deps,
  magazine: unknown,
  viewerId: string | null,
): Promise<boolean> {
  return (
    (await loadMagazineEditing(deps, magazine, viewerId))?.isEditor ?? false
  );
}

/** The magazine an editor writes for, as the article editor names it. */
export type MagazineWriting = { magazineId: number; magazineName: string };

/**
 * The write page's gate (Gate-Before-Fail): the magazine of a live
 * community, when the viewer is its editor; null otherwise (no community,
 * no magazine yet, or not an editor), which the page answers with a 404.
 */
export async function loadMagazineWriting(
  deps: Deps,
  opts: { communitySlug: string; viewerId: string | null },
): Promise<MagazineWriting | null> {
  if (opts.viewerId === null) return null;
  const community = await deps.db.query.communities.findFirst({
    where: and(
      eq(communities.slug, opts.communitySlug),
      isNull(communities.deletedAt),
    ),
    columns: { id: true },
  });
  if (!community) return null;
  const magazine = await getMagazineForCommunity(deps.payload, community.id);
  if (!magazine) return null;
  const standing = await loadMagazineEditorship(
    deps.db,
    { communityId: community.id, magazineId: magazine.id },
    opts.viewerId,
  );
  return standing.isEditor
    ? { magazineId: magazine.id, magazineName: magazine.name }
    : null;
}

/**
 * The edit page's gate: the write page's gate, plus the article must be
 * this magazine's and the viewer must be its author. Null otherwise, so
 * nobody learns which article slugs exist in other magazines or the blog.
 * The article is its latest draft version (what the author last saved).
 */
export async function loadMagazineArticleForEditing(
  deps: Deps,
  opts: { communitySlug: string; articleSlug: string; viewerId: string | null },
): Promise<(MagazineWriting & { article: Article }) | null> {
  const writing = await loadMagazineWriting(deps, opts);
  if (!writing) return null;
  const { docs } = await deps.payload.find({
    collection: "articles",
    where: { slug: { equals: opts.articleSlug } },
    depth: 0,
    draft: true,
    limit: 1,
    pagination: false,
  });
  const article = docs[0];
  if (!article) return null;
  const isOwnArticleHere =
    isEditableBy(article, opts.viewerId) &&
    relationIdOrNull(article.magazine) === writing.magazineId;
  return isOwnArticleHere ? { ...writing, article } : null;
}

/**
 * The magazine's approved, unplaced articles, for an editor of the
 * magazine (`viewerId`).
 */
export async function listAvailableArticles(
  payload: PayloadClient,
  magazineId: number,
  viewerId: string,
  query = "",
  exclude: readonly number[] = [],
  limit = EDITOR_LIST_LIMIT,
): Promise<AvailableMagazineArticle[]> {
  const { docs } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { magazine: { equals: magazineId } },
        { reviewStatus: { equals: "approved" } },
        { magazineIssue: { exists: false } },
        ...(exclude.length ? [{ id: { not_in: [...exclude] } }] : []),
        ...(query ? [{ title: { like: query } }] : []),
      ],
    },
    sort: "-updatedAt",
    depth: 0,
    draft: true,
    limit,
    pagination: false,
  });
  return docs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    authorName: doc.authorName ?? null,
    updatedAt: doc.updatedAt,
    editableByViewer: isEditableBy(doc, viewerId),
  }));
}

/**
 * The part of the edit page's gate an article list can answer for an
 * editor of its magazine: the viewer wrote it. Shared with
 * `loadMagazineArticleForEditing`, so a link is offered exactly when the
 * page will open.
 */
function isEditableBy(
  article: Pick<Article, "authorId">,
  viewerId: string | null,
): boolean {
  return viewerId !== null && article.authorId === viewerId;
}

/** An article the viewer may open in the article editor. */
export type EditableArticle = { id: number; slug: string };

/**
 * The articles among `articleIds` (of this magazine) that the viewer, an
 * editor of the magazine, may open in the article editor: the same rule as
 * the edit page's gate, so the builder offers "Open article" exactly when
 * the page will open.
 */
export async function listEditableArticles(
  payload: PayloadClient,
  magazineId: number,
  articleIds: readonly number[],
  viewerId: string,
): Promise<EditableArticle[]> {
  if (articleIds.length === 0) return [];
  const { docs } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { id: { in: [...articleIds] } },
        { magazine: { equals: magazineId } },
      ],
    },
    select: { slug: true, authorId: true },
    depth: 0,
    draft: true,
    limit: articleIds.length,
    pagination: false,
  });
  return docs
    .filter((doc) => isEditableBy(doc, viewerId))
    .map((doc) => ({ id: doc.id, slug: doc.slug }));
}

/** Not approved: never submitted (null), sent back, or refused. */
const NOT_READY: Where = {
  or: [
    { reviewStatus: { exists: false } },
    { reviewStatus: { not_equals: "approved" } },
  ],
};

/** The author's articles for the magazine that are not ready yet. */
export async function listDraftArticles(
  payload: PayloadClient,
  magazineId: number,
  authorId: string,
): Promise<DraftMagazineArticle[]> {
  const { docs } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { magazine: { equals: magazineId } },
        { authorId: { equals: authorId } },
        NOT_READY,
      ],
    },
    sort: "-updatedAt",
    depth: 0,
    draft: true,
    limit: EDITOR_LIST_LIMIT,
    pagination: false,
  });
  return docs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    reviewStatus: doc.reviewStatus ?? null,
    updatedAt: doc.updatedAt,
  }));
}
