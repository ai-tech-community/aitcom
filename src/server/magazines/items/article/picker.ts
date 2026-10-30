import { magazineArticleEditPath } from "@/lib/magazines/paths";
import { PICKER_LIMIT } from "@/lib/magazines/picker";

import {
  listAvailableArticles,
  type AvailableMagazineArticle,
} from "../../magazine-articles";
import { excludedNumericReferenceIds } from "../picker-exclusions";
import type { InputOf } from "../registry";
import type {
  ItemPickerSource,
  PickerContext,
  PickerSourceCandidate,
} from "../types";

export function articleCandidate(
  article: AvailableMagazineArticle,
  ctx: PickerContext,
): PickerSourceCandidate<InputOf<"article">> {
  return {
    input: { kind: "article", articleId: article.id },
    title: article.title,
    facts: article.authorName
      ? [{ type: "byline", name: article.authorName }]
      : [],
    openHref: article.editableByViewer
      ? magazineArticleEditPath(ctx.community.slug, article.slug)
      : null,
  };
}

export const articlePicker: ItemPickerSource<InputOf<"article">> = {
  async search(query, ctx, exclude) {
    const excludedIds = excludedNumericReferenceIds("article", exclude);
    const articles = await listAvailableArticles(
      ctx.deps.payload,
      ctx.magazineId,
      ctx.viewerId,
      query,
      excludedIds,
      PICKER_LIMIT,
    );
    return articles
      .slice(0, PICKER_LIMIT)
      .map((article) => articleCandidate(article, ctx));
  },
};
