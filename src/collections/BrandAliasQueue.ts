import type { CollectionConfig } from "payload";

export const BrandAliasQueue: CollectionConfig = {
  slug: "brand-alias-queue",
  dbName: "brand_alias_queue",
  admin: {
    useAsTitle: "rawMention",
    defaultColumns: [
      "rawMention",
      "suggestedBrand",
      "status",
      "occurrenceCount",
      "createdAt",
    ],
    description:
      "Unrecognised brand mentions surfaced by the extraction pipeline, awaiting moderator triage.",
  },
  access: {
    read: ({ req }) => req.user?.role === "admin",
    create: () => false,
    update: ({ req }) => req.user?.role === "admin",
    delete: ({ req }) => req.user?.role === "admin",
  },
  fields: [
    {
      name: "rawMention",
      type: "text",
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "suggestedBrand",
      type: "relationship",
      relationTo: "brands",
      admin: { position: "sidebar" },
    },
    {
      name: "runId",
      type: "text",
      admin: {
        readOnly: true,
        position: "sidebar",
        description:
          "benchmark_run UUID (read-only reference; no Payload collection for runs).",
      },
    },
    {
      name: "occurrenceCount",
      type: "number",
      defaultValue: 1,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Merged", value: "merged" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "reviewedByUser",
      type: "relationship",
      relationTo: "users",
      admin: { position: "sidebar" },
    },
    {
      name: "reviewedAt",
      type: "date",
      admin: { position: "sidebar" },
    },
  ],
};
