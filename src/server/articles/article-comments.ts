import type { PayloadClient } from "@/server/magazines/deps";

/** Most comments one read returns, oldest first. */
const COMMENT_PAGE_SIZE = 100;

/** One comment as the shared comment thread renders it. */
export type ArticleComment = {
  id: number;
  content: string;
  parentId: number | null;
  createdAt: string;
  authorId: string;
  authorName: string | null;
};

/**
 * The comments on one article, oldest first. It does not check access:
 * comments are as private as their article, so the caller decides first
 * (`canReadArticle`, or the article page's own read model).
 */
export async function listArticleComments(
  payload: Pick<PayloadClient, "find">,
  articleId: number,
): Promise<ArticleComment[]> {
  const { docs } = await payload.find({
    collection: "comments",
    where: { articleId: { equals: articleId } },
    sort: "createdAt",
    limit: COMMENT_PAGE_SIZE,
    depth: 0,
  });
  return docs.map((doc) => ({
    id: doc.id,
    content: doc.content,
    parentId: doc.parentId ?? null,
    createdAt: doc.createdAt,
    authorId: doc.authorId,
    authorName: doc.authorName ?? null,
  }));
}
