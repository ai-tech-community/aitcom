import type { CollectionConfig } from "payload";

export const Modules: CollectionConfig = {
  slug: "modules",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "course", "order"],
    description: "Optional grouping of lessons within a course (ADR-0034).",
  },
  fields: [
    {
      name: "course",
      type: "number",
      required: true,
      index: true,
      admin: { description: "courses.id" },
    },
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "order", type: "number", defaultValue: 0, index: true },
    { name: "summary", type: "text", maxLength: 500 },
  ],
  timestamps: true,
};
