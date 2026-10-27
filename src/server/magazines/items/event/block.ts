import type { Block } from "payload";

import { itemBaseFields } from "../base-fields";

/** A live event, kept as a plain numeric id (ADR-0044). */
export const eventItemBlock: Block = {
  slug: "event",
  labels: { singular: "Event", plural: "Events" },
  fields: [
    ...itemBaseFields,
    { name: "eventId", type: "number", required: true },
  ],
};
