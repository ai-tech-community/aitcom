import type { CollectionConfig } from "payload";

export const BenchmarkCategories: CollectionConfig = {
  slug: "benchmark-categories",
  dbName: "benchmark_category",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["slug", "name", "parent", "createdAt"],
    description:
      "Taxonomy categories for benchmark prompts (e.g. Finance, Health).",
  },
  fields: [
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "parent",
      type: "relationship",
      relationTo: "benchmark-categories",
      admin: { position: "sidebar" },
    },
    {
      name: "description",
      type: "textarea",
    },
  ],
};
