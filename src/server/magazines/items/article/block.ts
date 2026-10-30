import type { Block } from "payload";

import { itemBaseFields } from "../base-fields";

/**
 * An original magazine article in an issue. The article itself holds the
 * text; this row holds its place in the issue's order. Pure config: the
 * Payload config imports it, so it must not import server code.
 */
export const articleItemBlock: Block = {
  slug: "article",
  labels: { singular: "Article", plural: "Articles" },
  fields: [
    ...itemBaseFields,
    {
      name: "article",
      type: "relationship",
      relationTo: "articles",
      required: true,
    },
  ],
};
