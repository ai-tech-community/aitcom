import type { CollectionConfig } from "payload";

export const CommunityIdeas: CollectionConfig = {
  slug: "community-ideas",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "voteCount", "author", "createdAt"],
    description: "Community feature requests and proposals. Change status as ideas are implemented or declined.",
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
      admin: { position: "sidebar" },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "open",
      options: [
        { label: "Open", value: "open" },
        { label: "Implemented", value: "implemented" },
        { label: "Rejected", value: "rejected" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "voteCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
