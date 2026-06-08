import type { CollectionConfig } from "payload";

export const CommunityLinks: CollectionConfig = {
  slug: "community-links",
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "url", "communityId", "sortOrder"],
    description: "Admin-curated sidebar links for one community.",
  },
  fields: [
    { name: "label", type: "text", required: true, maxLength: 60 },
    { name: "url", type: "text", required: true, maxLength: 500 },
    { name: "emoji", type: "text", maxLength: 8 },
    { name: "communityId", type: "text", required: true, index: true },
    { name: "sortOrder", type: "number", defaultValue: 0, index: true },
  ],
  timestamps: true,
};
