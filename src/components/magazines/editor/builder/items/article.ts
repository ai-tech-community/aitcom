import { articleInputReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

/**
 * A magazine article in the builder. The article's text lives in the
 * article editor; the builder holds its place in the issue.
 */
export const articleBuilderKind = referenceBuilderKind({
  kind: "article",
  labelKey: "article",
  referenceOf: articleInputReference,
  openLabelKey: "openArticle",
});
