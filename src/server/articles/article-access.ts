import type { Where } from "payload";

import { magazineArticlePath } from "@/lib/magazines/paths";
import type { Article } from "@/payload-types";
import type { Deps, PayloadClient } from "@/server/magazines/deps";
import { loadIssueAccessById } from "@/server/magazines/issue-access";
import {
  type IssueReadScope,
  readableIssueIds,
} from "@/server/magazines/readable-issues";
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

/** The one seam for article surfaces: issues whose articles the scope may read (Decision 3). */
export function readableArticleIssueIds(
  payload: Pick<PayloadClient, "find">,
  scope: IssueReadScope,
  narrow?: Where,
): Promise<number[]> {
  return readableIssueIds(payload, scope, "full", narrow);
}

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
      return (await magazineArticleReach(deps, article, viewerId)).readable;
  }
}

/**
 * Whether the viewer may comment on an article, by its channel's
 * `commentPolicy` (ADR-0043):
 * - `open`: they may.
 * - `unpublished`: they may read it, but it has no readers yet (a blog
 *   article not public yet, an editor's preview of unpublished magazine
 *   work), so it has no comment thread.
 * - `not_found`: they may not read it; its existence is not revealed.
 */
export type ArticleCommentAccess = "open" | "unpublished" | "not_found";

export async function articleCommentAccess(
  deps: Deps,
  article: ReadableArticleFacts,
  viewerId: string | null,
): Promise<ArticleCommentAccess> {
  const policy = channelFor(article).commentPolicy;
  switch (policy) {
    case "public_article":
      return isPublicArticle(article) ? "open" : "unpublished";
    case "published_issue_reader": {
      const reach = await magazineArticleReach(deps, article, viewerId);
      if (!reach.readable) return "not_found";
      return reach.inPublishedIssue && article.status === "published"
        ? "open"
        : "unpublished";
    }
  }
}

type MagazineArticleReach = {
  /** The viewer may read the article (the read rule above). */
  readable: boolean;
  /** It is placed in an issue that is published. */
  inPublishedIssue: boolean;
};

async function magazineArticleReach(
  deps: Deps,
  article: ReadableArticleFacts,
  viewerId: string | null,
): Promise<MagazineArticleReach> {
  const issueId = relationIdOrNull(article.magazineIssue);
  const found =
    issueId === null
      ? null
      : await loadIssueAccessById(deps, issueId, viewerId);
  // Not placed (or its issue is gone): only the magazine's editors read it.
  if (!found) {
    return {
      readable: await isEditorOfMagazine(deps, article.magazine, viewerId),
      inPublishedIssue: false,
    };
  }

  const { issue, access } = found;
  const inPublishedIssue = issue.status === "published";
  switch (access) {
    case "editor":
      return { readable: true, inPublishedIssue };
    case "full":
      return {
        readable: article.status === "published",
        inPublishedIssue,
      };
    case "none":
    case "teaser":
      return { readable: false, inPublishedIssue };
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
