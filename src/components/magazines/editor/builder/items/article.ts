import { itemReference } from "@/lib/magazines/references";

import type { BuilderItemKind } from "./types";

/** The reference key of a magazine article (one article, one issue item). */
export function articleReference(articleId: number): string {
  return itemReference("article", articleId);
}

/**
 * A magazine article in the builder. The article's text lives in the
 * article editor; the builder holds its place in the issue. Its row is
 * named by the article's title: from its saved view, else from the title
 * it was added with.
 */
export const articleBuilderKind: BuilderItemKind<"article"> = {
  labelKey: "article",
  rowTitle(_item, ctx) {
    const saved = ctx.saved;
    if (saved?.kind === "article" && !("unavailable" in saved)) {
      return saved.article.title;
    }
    return ctx.titleHint ?? ctx.t("article");
  },
  isSavable: () => true,
  // An article shows its last saved view (preflight F32): the preview has
  // no copy of the article's text before the issue is saved.
  previewView: (item, saved) => (saved ? { ...saved, itemId: item.key } : null),
  referenceKey: (item) => articleReference(item.articleId),
  openLabelKey: "openArticle",
};
