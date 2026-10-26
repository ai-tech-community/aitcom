import type { Field } from "payload";

/**
 * Fields every issue item has, whatever its kind. Each kind's block lists
 * these first, so the builder and the reading page can treat them alike.
 */
export const itemBaseFields: Field[] = [
  {
    name: "intro",
    type: "text",
    maxLength: 280,
    admin: { description: "Optional line shown above the item in the issue." },
  },
];
