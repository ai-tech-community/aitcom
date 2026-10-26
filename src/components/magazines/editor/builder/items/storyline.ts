import { itemReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const storylineBuilderKind = referenceBuilderKind({
  kind: "storyline",
  labelKey: "storyline",
  referenceOf: (item) => itemReference("storyline", item.storylineId),
});
