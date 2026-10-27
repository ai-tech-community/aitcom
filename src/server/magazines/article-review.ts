import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";

import { reviewStatusFor, type ReviewDecision } from "@/lib/magazines/review";
import type { Magazine } from "@/payload-types";
import { logActivity } from "@/server/agent/activity";
import { communities } from "@/server/db/schema";

import type { Deps, PayloadClient } from "./deps";
import { loadMagazineDesk } from "./desk";
import { standingCan } from "./editorship";
import { magazineError } from "./errors";
import { requireMagazineCapability } from "./magazine-articles";
import { notifyArticleReviewed } from "./notifications";
import { inPayloadTransaction, lockArticle } from "./payload-writes";
import { relationIdOrNull } from "./relation-id";

export type PendingMagazineArticle = {
  id: number;
  slug: string;
  title: string;
  authorName: string | null;
  sentAt: string;
};

/** The editor queue, oldest hand-in first, including writers who have left. */
export async function listPendingArticles(
  payload: PayloadClient,
  magazineId: number,
): Promise<PendingMagazineArticle[]> {
  const { docs } = await payload.find({
    collection: "articles",
    where: {
      and: [
        { magazine: { equals: magazineId } },
        { reviewStatus: { equals: "pending_review" } },
      ],
    },
    sort: "updatedAt",
    depth: 0,
    draft: true,
    limit: 100,
    pagination: false,
  });
  return docs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    authorName: doc.authorName ?? null,
    sentAt: doc.updatedAt,
  }));
}

export type ArticleForReview = {
  id: number;
  slug: string;
  title: string;
  type: string | null;
  authorName: string | null;
  content: unknown;
  reviewStatus: string | null;
  reviewNote: string | null;
  updatedAt: string;
};

export type ReviewPageData = {
  magazine: { id: number; name: string };
  article: ArticleForReview;
};

/** Editors only; a member's latest draft in this magazine. Null means 404. */
export async function loadArticleForReview(
  deps: Deps,
  opts: {
    communitySlug: string;
    articleSlug: string;
    viewerId: string | null;
  },
): Promise<ReviewPageData | null> {
  if (opts.viewerId === null) return null;
  const desk = await loadMagazineDesk(deps, opts);
  if (!desk?.magazine || !standingCan(desk.standing, "edit")) return null;
  const { docs } = await deps.payload.find({
    collection: "articles",
    where: {
      and: [
        { slug: { equals: opts.articleSlug } },
        { magazine: { equals: desk.magazine.id } },
        { authorType: { equals: "member" } },
      ],
    },
    depth: 0,
    draft: true,
    limit: 1,
    pagination: false,
  });
  const article = docs[0];
  if (!article) return null;
  return {
    magazine: { id: desk.magazine.id, name: desk.magazine.name },
    article: {
      id: article.id,
      slug: article.slug,
      title: article.title,
      type: article.type ?? null,
      authorName: article.authorName ?? null,
      content: article.content,
      reviewStatus: article.reviewStatus ?? null,
      reviewNote: article.reviewNote ?? null,
      updatedAt: article.updatedAt,
    },
  };
}

/** Decide on the latest draft under its row lock; approval never publishes. */
export async function reviewMagazineArticle(
  deps: Deps,
  magazine: Magazine,
  input: { articleId: number; decision: ReviewDecision; note?: string },
  reviewer: { userId: string; community: { id: string; slug: string } },
): Promise<{ reviewStatus: "approved" | "changes_requested" | "rejected" }> {
  const note = input.note?.trim();
  if (input.decision === "request_changes" && !note)
    throw magazineError("REVIEW_NOTE_REQUIRED");
  const reviewStatus = reviewStatusFor(input.decision);
  const reviewNote = input.decision === "approve" || !note ? null : note;
  const article = await inPayloadTransaction(deps.payload, async (tx) => {
    const locked = await lockArticle(tx, deps.payload, input.articleId);
    if (!locked || relationIdOrNull(locked.magazine) !== magazine.id)
      throw new TRPCError({ code: "NOT_FOUND" });
    await requireMagazineCapability(deps, magazine.id, reviewer.userId, "edit");
    if (locked.reviewStatus !== "pending_review")
      throw magazineError("ARTICLE_NOT_PENDING");
    return deps.payload.update({
      collection: "articles",
      id: locked.id,
      data: { reviewStatus, reviewNote },
      req: tx.req,
    });
  });

  // An activity outage must not report a committed decision as failed or
  // prevent the independent notice attempt.
  try {
    await logActivity(deps.db, {
      actorId: reviewer.userId,
      actorType: "member",
      action: "magazine_article.reviewed",
      targetType: "articles",
      targetId: String(article.id),
      communityId: reviewer.community.id,
      metadata: {
        decision: input.decision,
        magazineId: magazine.id,
        title: article.title,
      },
    });
  } catch (error) {
    console.error("[magazines] activity failed", error);
  }

  // Re-read the live community after commit, inside the notice's failure
  // boundary, so a deleted community or unavailable inbox cannot fail a decision.
  try {
    const community = await deps.db.query.communities.findFirst({
      where: and(
        eq(communities.id, magazine.communityId),
        isNull(communities.deletedAt),
      ),
      columns: { id: true, slug: true },
    });
    if (community && article.authorId) {
      await notifyArticleReviewed(deps.db, {
        authorId: article.authorId,
        decision: input.decision,
        note: reviewNote,
        articleTitle: article.title,
        articleSlug: article.slug,
        magazineName: magazine.name,
        community,
      });
    }
  } catch (error) {
    console.error("[magazines] notification failed", error);
  }
  return { reviewStatus };
}
