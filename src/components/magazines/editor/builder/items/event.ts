import { eventInputReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const eventBuilderKind = referenceBuilderKind({
  kind: "event",
  labelKey: "event",
  referenceOf: eventInputReference,
});
