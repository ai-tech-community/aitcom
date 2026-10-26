import { itemReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const eventBuilderKind = referenceBuilderKind({
  kind: "event",
  labelKey: "event",
  referenceOf: (item) => itemReference("event", Number(item.eventId)),
});
