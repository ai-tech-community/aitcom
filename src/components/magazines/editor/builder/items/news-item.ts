import { newsItemInputReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const newsItemBuilderKind = referenceBuilderKind({
  kind: "newsItem",
  labelKey: "newsItem",
  referenceOf: newsItemInputReference,
});
