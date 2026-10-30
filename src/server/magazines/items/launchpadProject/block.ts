import type { Block } from "payload";

import { itemBaseFields } from "../base-fields";

/** A live launchpad project, kept as a plain numeric id (ADR-0044). */
export const launchpadProjectItemBlock: Block = {
  slug: "launchpadProject",
  labels: { singular: "Launchpad project", plural: "Launchpad projects" },
  fields: [
    ...itemBaseFields,
    { name: "projectId", type: "number", required: true },
  ],
};
