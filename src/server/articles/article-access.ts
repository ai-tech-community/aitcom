import type { Where } from "payload";

import { magazineArticlePath } from "@/lib/magazines/paths";
import type { Article } from "@/payload-types";
import type { Deps, PayloadClient } from "@/server/magazines/deps";
import { loadMagazineIssueAccess } from "@/server/magazines/issue-access";
import {
  type IssuePlace,
  loadIssuePlaces,
} from "@/server/magazines/issue-places";
import { isEditorOfMagazine } from "@/server/magazines/magazine-articles";
import { relationIdOrNull } from "@/server/magazines/relation-id";

import { channelFor } from "./channels";
import { isPublicArticle, publicArticleWhere } from "./public-articles";

/**
 * Who may read an article, on every surface that is not the article's own
 * page (ADR-0042, ADR-0043). A blog article follows the blog rule. A
 * magazine article is readable only through the issue that holds it: it
 * must be published and placed in an issue the viewer may read. The issue
 * rule itself lives in `issue-access.ts`; this module never restates it.
 */

/**
 * Magazine articles placed in one of these readable issues and published.
 * Null when there is no readable issue (a Payload `where` must not hold
 * `in: []`).
 */
export function readableMagazineArticleWhere(
  readableIssueIds: readonly number[],
): Where | null {
  if (readableIssueIds.length === 0) return null;
  return {
    and: [
      { status: { equals: "published" } },
      { magazineIssue: { in: [...readableIssueIds] } },
    ],
  };
}

/** Blog-public articles, plus magazine articles placed in one of these readable issues and published. */
export function readableArticleWhere(
  readableIssueIds: readonly number[],
): Where {
  const magazine = readableMagazineArticleWhere(readableIssueIds);
  return magazine
    ? { or: [publicArticleWhere(), magazine] }
    : publicArticleWhere();
}

export type ReadableArticleFacts = Pick<
  Article,
  "status" | "authorType" | "reviewStatus" | "magazine" | "magazineIssue"
>;

/**
 * The one per-article read check (comments, any by-id read). An editor of
 * the magazine's community reads its articles at any stage, placed or not;
 * anyone else needs a published article in an issue they may read.
 */
export async function canReadArticle(
  deps: Deps,
  article: ReadableArticleFacts,
  viewerId: string | null,
): Promise<boolean> {
  const channel = channelFor(article).id;
  switch (channel) {
    case "blog":
      return isPublicArticle(article);
    case "magazine":
      return canReadMagazineArticle(deps, article, viewerId);
  }
}

async function canReadMagazineArticle(
  deps: Deps,
  article: ReadableArticleFacts,
  viewerId: string | null,
): Promise<boolean> {
  const issueId = relationIdOrNull(article.magazineIssue);
  const issue =
    issueId === null
      ? null
      : await deps.payload.findByID({
          collection: "magazine-issues",
          id: issueId,
          depth: 0,
          disableErrors: true,
          select: {
            communityId: true,
            status: true,
            visibility: true,
            publicConfirmedAt: true,
          },
        });
  // Not placed (or its issue is gone): only the magazine's editors read it.
  if (!issue) return isEditorOfMagazine(deps, article.magazine, viewerId);

  const access = await loadMagazineIssueAccess(deps.db, issue, viewerId);
  switch (access) {
    case "editor":
      return true;
    case "full":
      return article.status === "published";
    case "none":
      return false;
  }
}

type LinkableArticle = Pick<Article, "slug" | "magazine" | "magazineIssue">;

/**
 * An article's page: `/blog/<slug>`, or the magazine path under the issue
 * that holds it. Null for a magazine article whose issue is not in
 * `places`: it has no page to link to.
 */
export function articleHref(
  article: LinkableArticle,
  places: ReadonlyMap<number, IssuePlace>,
): string | null {
  const channel = channelFor(article).id;
  switch (channel) {
    case "blog":
      return `/blog/${article.slug}`;
    case "magazine": {
      const issueId = relationIdOrNull(article.magazineIssue);
      const place = issueId === null ? undefined : places.get(issueId);
      return place
        ? magazineArticlePath(place.magazine, place.issue, article)
        : null;
    }
  }
}

/**
 * `/blog/<slug>` or the magazine path, for links on profiles, search and
 * the sitemap. Keyed by article id; an article with no page is missing
 * from the map. It does not check access: pass articles already read
 * through `readableArticleWhere` or `canReadArticle`.
 */
export async function articleHrefs(
  payload: Pick<PayloadClient, "find">,
  articles: readonly (LinkableArticle & Pick<Article, "id">)[],
): Promise<Map<number, string>> {
  const issueIds = articles.flatMap((article) => {
    const id =
      channelFor(article).id === "magazine"
        ? relationIdOrNull(article.magazineIssue)
        : null;
    return id === null ? [] : [id];
  });
  const places = await loadIssuePlaces(payload, issueIds);

  const hrefs = new Map<number, string>();
  for (const article of articles) {
    const href = articleHref(article, places);
    if (href !== null) hrefs.set(article.id, href);
  }
  return hrefs;
}
