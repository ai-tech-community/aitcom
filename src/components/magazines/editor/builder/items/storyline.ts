import { storylineInputReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const storylineBuilderKind = referenceBuilderKind({
  kind: "storyline",
  labelKey: "storyline",
  referenceOf: storylineInputReference,
});
