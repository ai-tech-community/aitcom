import { z } from "zod";

import { estimateReadingTime, extractPlainText } from "@/lib/lexical";
import type { ItemProblem, UnavailableItem } from "@/lib/magazines/item-views";
import type { Article } from "@/payload-types";

import { relationIdOrNull } from "../../relation-id";
import { itemIdOf } from "../item-id";
import type {
  IssueItemKind,
  ItemContext,
  ItemViewOf,
  StoredItem,
} from "../types";

const articleItemInput = z.object({
  kind: z.literal("article"),
  id: z.string().optional(),
  articleId: z.number().int().positive(),
  intro: z.string().max(280).optional(),
});

export type ArticleItemInput = z.infer<typeof articleItemInput>;
export type ArticleItemStored = StoredItem<"article">;

/** Words shown as an article's excerpt in an issue. */
const EXCERPT_WORDS = 40;

function excerptOf(content: unknown): string {
  const children = (content as { root?: { children?: unknown } } | null)?.root
    ?.children;
  const text = Array.isArray(children)
    ? extractPlainText(children as Parameters<typeof extractPlainText>[0])
    : "";
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > EXCERPT_WORDS
    ? `${words.slice(0, EXCERPT_WORDS).join(" ")}…`
    : words.join(" ");
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
    return { intro: input.intro ?? null, article: input.articleId };
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
      ...(stored.intro ? { intro: stored.intro } : {}),
    };
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
    // Editors preview the latest text; readers read the published document.
    const articles = await findArticles(items, ctx, ctx.editor);
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
      } else if (!ctx.editor && article.status !== "published") {
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
            excerpt: excerptOf(article.content),
            readingMinutes: estimateReadingTime(article.content),
            imageUrl: article.mediaUrl ?? null,
          },
        });
      }
    }
    return views;
  },

  // `load` already turns unpublished articles into `not_ready` markers for
  // readers, so every loaded article view is readable.
  isReadable: () => true,
};
