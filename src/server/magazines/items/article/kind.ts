import { z } from "zod";

import { estimateReadingTime } from "@/lib/lexical";
import { lexicalPlainText } from "@/lib/lexical-text";
import type { IssueReaderAccess } from "@/lib/magazines/access";
import type { ItemProblem, UnavailableItem } from "@/lib/magazines/item-views";
import { magazineArticleEditPath } from "@/lib/magazines/paths";
import { articleInputReference } from "@/lib/magazines/references";
import type { Article } from "@/payload-types";

import { listEditableArticles } from "../../magazine-articles";
import { relationIdOrNull, requireRelationId } from "../../relation-id";
import {
  cutWords,
  introInput,
  itemBaseInput,
  storedIntro,
} from "../base-input";
import { itemIdOf } from "../item-id";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";

const articleItemInput = z.object({
  kind: z.literal("article"),
  ...itemBaseInput,
  articleId: z.number().int().positive(),
});

export type ArticleItemInput = z.infer<typeof articleItemInput>;
export type ArticleItemStored = StoredItem<"article">;

/**
 * How an access level reads the articles of an issue. Exhaustive: a new
 * level is a compile error here until this kind decides what it shows.
 * - full:   the published document; an unpublished article is a marker
 *           (readers never see it, preflight F2)
 * - editor: the latest draft text, published or not
 */
function articleReadingFor(access: IssueReaderAccess): {
  draft: boolean;
  showsUnpublished: boolean;
} {
  switch (access) {
    case "teaser":
    case "full":
      return { draft: false, showsUnpublished: false };
    case "editor":
      return { draft: true, showsUnpublished: true };
  }
}

/** The articles behind a batch of items, by id: one query. */
async function findArticles(
  stored: ArticleItemStored[],
  ctx: ItemContext,
  draft: boolean,
): Promise<Map<number, Article>> {
  const ids = [
    ...new Set(
      stored
        .map((s) => relationIdOrNull(s.article))
        .filter((id): id is number => id !== null),
    ),
  ];
  if (ids.length === 0) return new Map();
  const { docs } = await ctx.payload.find({
    collection: "articles",
    where: { id: { in: ids } },
    draft,
    depth: 0,
    limit: ids.length,
    pagination: false,
    locale: ctx.locale,
  });
  return new Map(docs.map((doc) => [doc.id, doc]));
}

/**
 * A magazine article in an issue. The issue holds the order; the article
 * holds the text, its review state and its placement (`magazineIssue`).
 */
export const articleItemKind: IssueItemKind<
  "article",
  ArticleItemInput,
  ArticleItemStored
> = {
  kind: "article",
  input: articleItemInput,

  toStored(input) {
    return { intro: storedIntro(input.intro), article: input.articleId };
  },

  toInput(stored) {
    const articleId = relationIdOrNull(stored.article);
    if (articleId === null) {
      throw new Error("A stored article item has no article");
    }
    return {
      kind: "article",
      ...(stored.id ? { id: stored.id } : {}),
      articleId,
      ...introInput(stored.intro),
    };
  },

  referenceOf: (stored) =>
    articleInputReference({ articleId: requireRelationId(stored.article) }),

  async openHrefs(items, ctx) {
    if (ctx.reader.viewerId === null) return {};
    const ids = [
      ...new Set(items.map((item) => requireRelationId(item.article))),
    ];
    const articles = await listEditableArticles(
      ctx.payload,
      ctx.magazineId,
      ids,
      ctx.reader.viewerId,
    );
    return Object.fromEntries(
      articles.map((article) => [
        articleInputReference({ articleId: article.id }),
        magazineArticleEditPath(ctx.community.slug, article.slug),
      ]),
    );
  },

  async validate(items, ctx) {
    // The latest saved state (draft versions included) decides readiness.
    const articles = await findArticles(
      items.map((i) => i.stored),
      ctx,
      true,
    );
    const seen = new Set<number>();
    const problems: ItemProblem[] = [];
    for (const { index, stored } of items) {
      const articleId = relationIdOrNull(stored.article);
      const article = articleId === null ? undefined : articles.get(articleId);
      if (!article || relationIdOrNull(article.magazine) !== ctx.magazineId) {
        problems.push({ itemIndex: index, code: "ITEM_INVALID" });
      } else if (seen.has(article.id)) {
        problems.push({
          itemIndex: index,
          code: "ITEM_INVALID",
          detail: "duplicate",
        });
      } else if (article.reviewStatus !== "approved") {
        problems.push({ itemIndex: index, code: "ARTICLE_NOT_READY" });
      } else {
        const placedIn = relationIdOrNull(article.magazineIssue);
        if (placedIn !== null && placedIn !== ctx.issueId) {
          problems.push({ itemIndex: index, code: "ARTICLE_PLACED" });
        }
      }
      if (article) seen.add(article.id);
    }
    return problems;
  },

  async load(items, ctx) {
    const reading = articleReadingFor(ctx.access);
    const articles = await findArticles(items, ctx, reading.draft);
    const views = new Map<string, ItemViewOf<"article"> | UnavailableItem>();
    for (const stored of items) {
      const itemId = itemIdOf(stored);
      const articleId = relationIdOrNull(stored.article);
      const article = articleId === null ? undefined : articles.get(articleId);
      const unavailable = (
        reason: UnavailableItem["reason"],
      ): UnavailableItem => ({
        kind: "article",
        itemId,
        unavailable: true,
        reason,
      });
      if (!article) {
        views.set(itemId, unavailable("missing"));
      } else if (relationIdOrNull(article.magazine) !== ctx.magazineId) {
        views.set(itemId, unavailable("other_magazine"));
      } else if (!reading.showsUnpublished && article.status !== "published") {
        // A magazine article is published with its issue; until then
        // readers never see it (preflight F2).
        views.set(itemId, unavailable("not_ready"));
      } else {
        views.set(itemId, {
          kind: "article",
          itemId,
          intro: stored.intro ?? null,
          article: {
            id: article.id,
            slug: article.slug,
            title: article.title,
            authorName: article.authorName ?? null,
            excerpt: cutWords(lexicalPlainText(article.content), 40),
            readingMinutes: estimateReadingTime(article.content),
            imageUrl: article.mediaUrl ?? null,
          },
        });
      }
    }
    return views;
  },

  // `load` already turns what a level may not see into markers
  // (`articleReadingFor`), so every loaded article view is readable.
  isReadable: (_view, ctx) => {
    switch (ctx.access) {
      case "teaser":
      case "full":
      case "editor":
        return true;
    }
  },
};
