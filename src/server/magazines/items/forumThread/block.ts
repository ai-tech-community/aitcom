import type { Block } from "payload";

import { itemBaseFields } from "../base-fields";

/** A live forum thread, kept as a plain numeric id (ADR-0044). */
export const forumThreadItemBlock: Block = {
  slug: "forumThread",
  labels: { singular: "Forum thread", plural: "Forum threads" },
  fields: [
    ...itemBaseFields,
    { name: "threadId", type: "number", required: true },
  ],
};
