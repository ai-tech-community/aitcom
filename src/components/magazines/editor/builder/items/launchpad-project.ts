import { itemReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const launchpadProjectBuilderKind = referenceBuilderKind({
  kind: "launchpadProject",
  labelKey: "launchpadProject",
  referenceOf: (item) =>
    itemReference("launchpadProject", Number(item.projectId)),
});
