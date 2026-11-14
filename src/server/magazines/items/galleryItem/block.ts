import type { Block } from "payload";

import { itemBaseFields } from "../base-fields";

/**
 * A community gallery photo or video, kept as a plain numeric id (ADR-0044):
 * deleting the item leaves its block, which then shows as missing. The
 * shared `image` field stays for a uniform table shape; `validate` refuses
 * any value in it.
 */
export const galleryItemItemBlock: Block = {
  slug: "galleryItem",
  labels: { singular: "Gallery item", plural: "Gallery items" },
  fields: [
    ...itemBaseFields,
    { name: "galleryItemId", type: "number", required: true },
  ],
};
