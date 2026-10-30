import type { Where } from "payload";

import { channelFor } from "./channels";

/**
 * The one rule for which articles the public may read on the blog:
 * published, a member's article only once a reviewer approved it, and not
 * written for a community magazine (those are read through their issue).
 * Staff articles need no review. Every public article list and page uses
 * these two forms.
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
      { magazine: { exists: false } },
    ],
  };
}

/** The same rule for an article already loaded. */
export function isPublicArticle(article: {
  status?: string | null;
  authorType?: string | null;
  reviewStatus?: string | null;
  magazine?: unknown;
}): boolean {
  return (
    channelFor(article).id === "blog" &&
    article.status === "published" &&
    (article.authorType !== "member" || article.reviewStatus === "approved")
  );
}
