import type { Block } from "payload";

import { articleRichTextEditor } from "@/collections/shared/article-rich-text";

import { itemBaseFields } from "../base-fields";

/**
 * Free-form text owned by the issue (an editor's column, a section opener).
 * Uses the article editor so it is stored and rendered like article content.
 * Pure config: the Payload config imports it, so it must not import server
 * code.
 */
export const editorialItemBlock: Block = {
  slug: "editorial",
  labels: { singular: "Editorial", plural: "Editorials" },
  fields: [
    ...itemBaseFields,
    { name: "heading", type: "text", maxLength: 160, localized: true },
    {
      name: "body",
      type: "richText",
      required: true,
      localized: true,
      editor: articleRichTextEditor,
    },
  ],
};
