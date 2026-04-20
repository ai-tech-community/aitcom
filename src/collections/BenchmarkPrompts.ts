import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

const autoApprovalHook: CollectionBeforeChangeHook = ({ data, req, operation }) => {
  if (
    operation === "update" &&
    data &&
    data.status === "approved" &&
    !data.approvedByUser &&
    req.user
  ) {
    data.approvedByUser = req.user.id;
    data.approvedAt = new Date().toISOString();
  }
  return data;
};

export const BenchmarkPrompts: CollectionConfig = {
  slug: "benchmark-prompts",
  dbName: "benchmark_prompt",
  admin: {
    useAsTitle: "text",
    defaultColumns: ["text", "status", "category", "intent", "submittedByUser", "createdAt"],
    description:
      "Crowd-sourced prompts awaiting moderator approval before entering the benchmark.",
  },
  access: {
    read: () => true,
    create: () => false,
    update: ({ req }) => req.user?.role === "admin",
    delete: () => false,
  },
  hooks: {
    beforeChange: [autoApprovalHook],
  },
  fields: [
    {
      name: "text",
      type: "textarea",
      required: true,
      admin: { readOnly: true },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "category",
      type: "relationship",
      relationTo: "benchmark-categories",
      required: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "intent",
      type: "relationship",
      relationTo: "benchmark-intents",
      required: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "locale",
      type: "text",
      required: true,
      defaultValue: "en-US",
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "submittedByUser",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { readOnly: true, position: "sidebar" },
    },
    {
      name: "approvedByUser",
      type: "relationship",
      relationTo: "users",
      admin: { position: "sidebar" },
    },
    {
      name: "approvedAt",
      type: "date",
      admin: { position: "sidebar" },
    },
    {
      name: "notes",
      type: "textarea",
      admin: { description: "Internal moderation notes." },
    },
  ],
};
