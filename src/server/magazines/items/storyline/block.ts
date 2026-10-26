import type { Block } from "payload";

import { itemBaseFields } from "../base-fields";

/** A live AIT News story, stored as a plain id (ADR-0044). */
export const storylineItemBlock: Block = {
  slug: "storyline",
  labels: { singular: "Story", plural: "Stories" },
  fields: [
    ...itemBaseFields,
    { name: "storylineId", type: "text", required: true },
  ],
};
