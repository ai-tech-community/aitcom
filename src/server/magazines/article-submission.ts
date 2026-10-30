import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { mayWriterChange } from "@/lib/magazines/review";
import { handInFor } from "@/lib/magazines/roles";
import type { Article } from "@/payload-types";
import { communities } from "@/server/db/schema";

import { assertArticleNotPlaced } from "./article-placement";
import type { Deps } from "./deps";
import {
  listMagazineEditorIds,
  standingCan,
  type MagazineStanding,
} from "./editorship";
import { magazineError } from "./errors";
import { requireMagazineCapability } from "./magazine-articles";
import { notifyArticleSubmitted } from "./notifications";
import {
  inPayloadTransaction,
  lockArticle,
  type PayloadTransaction,
} from "./payload-writes";

/** The fields an author may save through articles.update. */
export type ArticlePatch = Partial<
  Pick<Article, "title" | "content" | "type" | "tags" | "mediaUrl">
>;

/** Author and writer-open checks belong to the locked write seam. */
function assertWriterMayChange(
  article: Article,
  userId: string,
  standing: MagazineStanding,
): void {
  if (article.authorId !== userId) throw new TRPCError({ code: "FORBIDDEN" });
  if (!mayWriterChange(standingCan(standing, "edit"), article))
    throw magazineError("ARTICLE_LOCKED");
}

/**
 * The magazine decides the hand-in from the writer's current capabilities.
 * Checks and writes use the latest draft under the article row lock; only
 * a committed contributor hand-in notifies the editors, and earns no XP.
 */
export async function submitMagazineArticle(
  deps: Deps,
  article: Article,
  userId: string,
): Promise<Article> {
  const result = await inPayloadTransaction(deps.payload, async (tx) => {
    const locked = await lockArticle(tx, deps.payload, article.id);
    if (!locked) throw new TRPCError({ code: "NOT_FOUND" });
    const { magazine, standing } = await requireMagazineCapability(
      deps,
      locked.magazine,
      userId,
      "write",
    );
    assertWriterMayChange(locked, userId, standing);
    switch (handInFor(standingCan(standing, "edit"))) {
      case "mark_ready":
        return {
          article: await markReadyForIssue(deps, tx, locked),
          magazine: null,
        };
      case "send_for_review":
        return {
          article: await deps.payload.update({
            collection: "articles",
            id: locked.id,
            data: { reviewStatus: "pending_review", reviewNote: null },
            req: tx.req,
          }),
          magazine,
        };
    }
  });

  if (result.magazine) {
    // Recipient lookup is part of the notice's failure boundary too: a
    // failed inbox must never turn a committed hand-in into an API failure.
    try {
      const magazine = result.magazine;
      const community = await deps.db.query.communities.findFirst({
        where: and(
          eq(communities.id, magazine.communityId),
          isNull(communities.deletedAt),
        ),
        columns: { id: true, slug: true },
      });
      if (community) {
        await notifyArticleSubmitted(deps.db, {
          editorIds: await listMagazineEditorIds(deps.db, {
            communityId: community.id,
            magazineId: magazine.id,
          }),
          authorName: result.article.authorName ?? null,
          articleTitle: result.article.title,
          articleSlug: result.article.slug,
          magazineName: magazine.name,
          community,
        });
      }
    } catch (error) {
      console.error("[magazines] notification failed", error);
    }
  }
  return result.article;
}

/** The caller already checked edit: approval means ready for an issue. */
async function markReadyForIssue(
  deps: Deps,
  tx: PayloadTransaction,
  article: Article,
): Promise<Article> {
  return deps.payload.update({
    collection: "articles",
    id: article.id,
    data: { reviewStatus: "approved", reviewNote: null },
    req: tx.req,
  });
}

/** Save only while the latest draft is open to this writer (Decision 12). */
export async function saveMagazineArticle(
  deps: Deps,
  articleId: number,
  userId: string,
  patch: ArticlePatch,
): Promise<Article> {
  return inPayloadTransaction(deps.payload, async (tx) => {
    const locked = await lockArticle(tx, deps.payload, articleId);
    if (!locked) throw new TRPCError({ code: "NOT_FOUND" });
    const { standing } = await requireMagazineCapability(
      deps,
      locked.magazine,
      userId,
      "write",
    );
    assertWriterMayChange(locked, userId, standing);
    return deps.payload.update({
      collection: "articles",
      id: locked.id,
      data: {
        ...patch,
        // Keep the editors' note visible while the author works; the next
        // hand-in clears it (Decision 7).
        ...(locked.reviewStatus === "changes_requested" && {
          reviewStatus: null,
        }),
      },
      draft: locked.status === "draft",
      req: tx.req,
    });
  });
}

/** Delete follows the same writer lock, plus publication and placement guards. */
export async function deleteMagazineArticle(
  deps: Deps,
  articleId: number,
  userId: string,
): Promise<void> {
  await inPayloadTransaction(deps.payload, async (tx) => {
    const locked = await lockArticle(tx, deps.payload, articleId);
    if (!locked) throw new TRPCError({ code: "NOT_FOUND" });
    const { standing } = await requireMagazineCapability(
      deps,
      locked.magazine,
      userId,
      "write",
    );
    // Authors delete their own open drafts. Someone who can edit the
    // magazine may delete any unpublished, unplaced article. Published
    // work and placed articles stay under the same guards as before.
    if (!standingCan(standing, "edit")) {
      assertWriterMayChange(locked, userId, standing);
    }
    if (locked.status === "published") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot delete published articles.",
      });
    }
    await assertArticleNotPlaced(deps.payload, locked.id, tx.req);
    await deps.payload.delete({
      collection: "articles",
      id: locked.id,
      req: tx.req,
    });
  });
}

/** Deletes a magazine's unpublished articles. A published one refuses the whole call. */
export async function deleteUnpublishedMagazineArticles(
  deps: Deps,
  magazineId: number,
): Promise<void> {
  const { docs } = await deps.payload.find({
    collection: "articles",
    where: { magazine: { equals: magazineId } },
    draft: true,
    depth: 0,
    limit: 500,
    pagination: false,
  });
  if (docs.some((article) => article.status === "published")) {
    throw magazineError("MAGAZINE_PUBLISHED");
  }
  for (const article of docs) {
    await deps.payload.delete({ collection: "articles", id: article.id });
  }
}
