import type { Field } from "payload";
import { itemImageSchema } from "@/lib/magazines/item-image";

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
  {
    name: "image",
    type: "json",
    validate: (value: unknown) =>
      value == null ||
      itemImageSchema.safeParse(value).success ||
      "Choose a valid item image and crop.",
    admin: {
      description:
        "Image, crop, focal point, caption, credit and alt text for this item in this issue.",
    },
  },
];
