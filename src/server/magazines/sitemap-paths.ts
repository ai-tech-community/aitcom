import {
  articleHref,
  readableMagazineArticleWhere,
} from "@/server/articles/article-access";
import {
  issuePath,
  MAGAZINES_HOME_PATH,
  magazinePath,
} from "@/lib/magazines/paths";

import type { Deps, PayloadClient } from "./deps";
import { loadIssuePlaces } from "./issue-places";
import { loadIssueReadScope, readableIssueIds } from "./readable-issues";

/**
 * Every magazine URL a signed-out visitor may open, for the sitemap
 * (spec Decision 8: the anonymous scope, whoever asks): the `/magazines`
 * home, each shelf with a public issue, each public issue, and each
 * published article in one. The sitemap is cached for its revalidate
 * window, so it may lag a visibility change by that long; access itself
 * never lags (ADR-0042).
 */
export async function magazineSitemapPaths(
  deps: Pick<Deps, "db"> & { payload: Pick<PayloadClient, "find"> },
): Promise<string[]> {
  const { db, payload } = deps;
  const issueIds = await readableIssueIds(
    payload,
    await loadIssueReadScope(db, null),
  );
  const articleWhere = readableMagazineArticleWhere(issueIds);
  if (articleWhere === null) return [MAGAZINES_HOME_PATH];

  const [places, articles] = await Promise.all([
    loadIssuePlaces(payload, issueIds),
    payload.find({
      collection: "articles",
      where: articleWhere,
      pagination: false,
      depth: 0,
      draft: false,
      select: { slug: true, magazine: true, magazineIssue: true },
    }),
  ]);

  const shelves = new Set<string>();
  const issues: string[] = [];
  for (const place of places.values()) {
    shelves.add(magazinePath(place.magazine));
    issues.push(issuePath(place.magazine, place.issue));
  }
  const articlePaths = articles.docs.flatMap((article) => {
    const href = articleHref(article, places);
    return href === null ? [] : [href];
  });

  return [MAGAZINES_HOME_PATH, ...shelves, ...issues, ...articlePaths];
}
