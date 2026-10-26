import type { PayloadRequest } from "payload";

import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { logActivity } from "@/server/agent/activity";
import {
  onArticleApproved,
  onArticleApprovedAfterSave,
} from "@/server/badges/article-approved";
import type { db } from "@/server/db";

export type ArticlePublicationAction =
  | "article.approved"
  | "magazine_article.published";

/**
 * Credit the author for a published article: approval XP, the article
 * badges and the activity entry. The one place this credit is granted.
 * The blog calls it from the Articles after-change hook when a reviewer
 * approves; a magazine calls it when an issue holding the article is
 * published.
 *
 * Pass `req` when running inside Payload's save (the after-change hook):
 * badges are then earned after the save commits. Without `req` they are
 * earned now.
 */
export async function creditArticlePublication(
  database: typeof db,
  article: { id: number; authorId: string; type: string | null; title: string },
  options: { action: ArticlePublicationAction; req?: PayloadRequest },
): Promise<void> {
  await awardXp(database, article.authorId, XP_AMOUNTS.ARTICLE_PUBLISHED);

  const badgeArticle = { authorId: article.authorId, type: article.type };
  if (options.req) {
    await onArticleApprovedAfterSave(database, badgeArticle, options.req);
  } else {
    await onArticleApproved(database, badgeArticle);
  }

  await logActivity(database, {
    actorId: article.authorId,
    actorType: "member",
    action: options.action,
    targetType: "articles",
    targetId: String(article.id),
    metadata: { title: article.title, type: article.type },
  });
}
