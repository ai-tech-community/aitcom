import type { AppLocale } from "@/i18n/messages";

import type { Deps } from "./deps";
import { loadReadableIssue } from "./reading";

export type ShareCard = {
  magazineName: string;
  communityName: string;
  issueNumber: number;
  issueTitle: string;
  coverImageUrl: string | null;
  article: { title: string; authorName: string | null } | null;
};

/** Anonymous scope only; visibility changes take effect on every request. */
export async function loadShareCard(
  deps: Deps,
  opts: {
    magazineSlug: string;
    issueSlug: string;
    articleSlug: string | null;
    locale: AppLocale;
  },
): Promise<ShareCard | null> {
  const found = await loadReadableIssue(deps, { ...opts, viewerId: null });
  if (!found) return null;
  switch (found.access) {
    case "editor":
      // Impossible for an anonymous viewer; fail closed if that ever changes.
      return null;
    case "teaser":
    case "full": {
      const { magazine, community, issue } = found;
      let article: ShareCard["article"] = null;
      if (opts.articleSlug !== null) {
        const { docs } = await deps.payload.find({
          collection: "articles",
          where: {
            and: [
              { slug: { equals: opts.articleSlug } },
              { magazine: { equals: magazine.id } },
              { magazineIssue: { equals: issue.id } },
              { status: { equals: "published" } },
            ],
          },
          draft: false,
          depth: 0,
          limit: 1,
          pagination: false,
          locale: opts.locale,
          select: { title: true, authorName: true },
        });
        const doc = docs[0];
        if (!doc) return null;
        article = { title: doc.title, authorName: doc.authorName ?? null };
      }
      return {
        magazineName: magazine.name,
        communityName: community.name,
        issueNumber: Number(issue.number),
        issueTitle: issue.title,
        coverImageUrl: issue.coverImageUrl ?? null,
        article,
      };
    }
  }
}
