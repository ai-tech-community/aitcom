import { magazineArticleEditPath } from "@/lib/magazines/paths";
import { PICKER_LIMIT } from "@/lib/magazines/picker";

import { listAvailableArticles } from "../../magazine-articles";
import type { InputOf } from "../registry";
import type { ItemPickerSource } from "../types";

export const articlePicker: ItemPickerSource<InputOf<"article">> = {
  async search(query, ctx) {
    const articles = await listAvailableArticles(
      ctx.deps.payload,
      ctx.magazineId,
      ctx.viewerId,
      query,
    );
    return articles.slice(0, PICKER_LIMIT).map((article) => ({
      input: { kind: "article", articleId: article.id },
      title: article.title,
      facts: article.authorName
        ? [{ type: "byline", name: article.authorName }]
        : [],
      openHref: article.editableByViewer
        ? magazineArticleEditPath(ctx.community.slug, article.slug)
        : null,
    }));
  },
};
