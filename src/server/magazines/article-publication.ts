import { sql } from "@payloadcms/db-postgres";

import { creditArticlePublication } from "@/server/articles/credit";
import type { Article } from "@/payload-types";

import type { Deps, PayloadClient } from "./deps";
import { inPayloadTransaction } from "./payload-writes";

/**
 * The issue-publish side of the article channel seam (ADR-0043, decision 6).
 * A magazine article is approved by its editor but stays a draft; it is
 * published, and its author credited, when an issue holding it is published
 * (or when it is added to an already published issue).
 */

/**
 * Publishes one article if it is not published yet; null when it already
 * was. The draft → published claim is one conditional UPDATE, so two
 * concurrent publishes of the same article publish (and credit) it once.
 *
 * The Payload update runs without `draft`, like the trusted-author path in
 * the articles router: Payload builds it on the latest version, so readers
 * get the latest draft text, not the text of the first save.
 */
async function publishOne(
  payload: PayloadClient,
  articleId: number,
): Promise<Article | null> {
  return inPayloadTransaction(payload, async (tx) => {
    const claimed = await tx.execute(sql`
      UPDATE "articles" SET "status" = 'published'
      WHERE "id" = ${articleId} AND "status" IS DISTINCT FROM 'published'
      RETURNING "id"
    `);
    if (claimed.length === 0) return null;
    return payload.update({
      collection: "articles",
      id: articleId,
      data: { status: "published", publishedAt: new Date().toISOString() },
      depth: 0,
      req: tx.req,
    });
  });
}

/**
 * Publishes placed articles that are not yet published and credits each
 * once (draft → published only). Idempotent: an article already published
 * is skipped and not credited again, so a retry after a partial failure
 * completes the rest. Callers pass articles the issue validated (approved,
 * in this magazine, placed in the issue).
 */
export async function publishPlacedArticles(
  deps: Deps,
  articleIds: number[],
): Promise<{ published: number[] }> {
  const published: number[] = [];
  for (const articleId of new Set(articleIds)) {
    const article = await publishOne(deps.payload, articleId);
    if (!article) continue;
    published.push(article.id);
    // The same rule as the blog's approval credit: member articles only.
    if (article.authorType === "member" && article.authorId) {
      await creditArticlePublication(
        deps.db,
        {
          id: article.id,
          authorId: article.authorId,
          type: article.type,
          title: article.title,
        },
        { action: "magazine_article.published" },
      );
    }
  }
  return { published };
}
