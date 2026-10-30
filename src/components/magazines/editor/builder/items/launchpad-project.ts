import { launchpadProjectInputReference } from "@/lib/magazines/references";

import { referenceBuilderKind } from "./reference";

export const launchpadProjectBuilderKind = referenceBuilderKind({
  kind: "launchpadProject",
  labelKey: "launchpadProject",
  referenceOf: launchpadProjectInputReference,
});
