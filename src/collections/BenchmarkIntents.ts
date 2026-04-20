import type { CollectionConfig } from "payload";

export const BenchmarkIntents: CollectionConfig = {
  slug: "benchmark-intents",
  dbName: "benchmark_intent",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["slug", "name", "createdAt"],
    description:
      "Intent labels for benchmark prompts (e.g. recommendation, comparison).",
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
      name: "description",
      type: "textarea",
    },
  ],
};
