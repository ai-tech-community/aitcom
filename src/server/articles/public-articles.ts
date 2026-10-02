import type { Where } from "payload";

/**
 * The one rule for which articles the public may read: published, and a
 * member's article only once a reviewer approved it. Staff articles need no
 * review. Every public article list and page uses these two forms.
 */
export function publicArticleWhere(): Where {
  return {
    and: [
      { status: { equals: "published" } },
      {
        or: [
          { authorType: { not_equals: "member" } },
          { reviewStatus: { equals: "approved" } },
        ],
      },
    ],
  };
}

/** The same rule for an article already loaded. */
export function isPublicArticle(article: {
  status?: string | null;
  authorType?: string | null;
  reviewStatus?: string | null;
}): boolean {
  return (
    article.status === "published" &&
    (article.authorType !== "member" || article.reviewStatus === "approved")
  );
}
