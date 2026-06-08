import type { CollectionConfig } from "payload";

export const CommunityTopics: CollectionConfig = {
  slug: "community-topics",
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "slug", "communityId", "sortOrder"],
    description: "Admin-defined feed topics (chip filters) for one community.",
  },
  fields: [
    { name: "label", type: "text", required: true, maxLength: 40 },
    { name: "slug", type: "text", required: true, index: true },
    { name: "emoji", type: "text", maxLength: 8 },
    {
      name: "communityId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Community this topic belongs to." },
    },
    { name: "sortOrder", type: "number", defaultValue: 0, index: true },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: { description: "The seeded 'General' topic; cannot be deleted." },
    },
  ],
  timestamps: true,
};
