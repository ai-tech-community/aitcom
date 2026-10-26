import { itemReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const forumThreadBuilderKind = referenceBuilderKind({
  kind: "forumThread",
  labelKey: "forumThread",
  referenceOf: (item) => itemReference("forumThread", Number(item.threadId)),
});
