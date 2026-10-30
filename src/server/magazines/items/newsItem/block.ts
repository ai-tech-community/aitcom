import type { Block } from "payload";

import { itemBaseFields } from "../base-fields";

/** A live AIT News headline, stored as a plain id (ADR-0044). */
export const newsItemBlock: Block = {
  slug: "newsItem",
  labels: { singular: "News", plural: "News" },
  fields: [
    ...itemBaseFields,
    { name: "newsItemId", type: "text", required: true },
  ],
};
