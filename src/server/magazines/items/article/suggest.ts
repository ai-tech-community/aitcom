import { magazineArticleEditPath } from "@/lib/magazines/paths";

import { listApprovedArticlesOldestFirst } from "../../magazine-articles";
import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";

export const articleSuggester: ItemSuggestionSource<InputOf<"article">> = {
  async suggest(ctx, _window, config) {
    if (config.limit <= 0) return [];
    const articles = await listApprovedArticlesOldestFirst(
      ctx.deps.payload,
      ctx.magazineId,
      ctx.viewerId,
      excludedNumericReferenceIds("article", config.exclude),
      config.limit,
    );
    return articles.map((article) => ({
      input: { kind: "article", articleId: article.id },
      title: article.title,
      facts: article.authorName
        ? [{ type: "byline", name: article.authorName }]
        : [],
      openHref: article.editableByViewer
        ? magazineArticleEditPath(ctx.community.slug, article.slug)
        : null,
      reason: { type: "waitingSince", at: article.updatedAt },
    }));
  },
};
