import { itemReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

/** The reference key of a magazine article (one article, one issue item). */
export function articleReference(articleId: number): string {
  return itemReference("article", articleId);
}

/**
 * A magazine article in the builder. The article's text lives in the
 * article editor; the builder holds its place in the issue.
 */
export const articleBuilderKind = referenceBuilderKind({
  kind: "article",
  labelKey: "article",
  referenceOf: (item) => articleReference(item.articleId),
  openLabelKey: "openArticle",
});
