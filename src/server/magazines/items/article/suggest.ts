import { listApprovedArticlesOldestFirst } from "../../magazine-articles";
import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type { ItemSuggestionSource } from "../types";
import { articleCandidate } from "./picker";

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
      ...articleCandidate(article, ctx),
      reason: { type: "waitingSince", at: article.updatedAt },
    }));
  },
};
