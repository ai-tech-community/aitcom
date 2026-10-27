import { forumThreadInputReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const forumThreadBuilderKind = referenceBuilderKind({
  kind: "forumThread",
  labelKey: "forumThread",
  referenceOf: forumThreadInputReference,
});
