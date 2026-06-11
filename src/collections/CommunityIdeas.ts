import type { CollectionConfig } from "payload";

export const CommunityIdeas: CollectionConfig = {
  slug: "community-ideas",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "status", "voteCount", "author", "createdAt"],
    description:
      "Community feature requests and proposals. Change status as ideas are implemented or declined.",
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
      name: "authorId",
      type: "text",
      required: true,
      admin: {
        position: "sidebar",
        description: "Better Auth user ID (UUID).",
      },
    },
    {
      name: "authorName",
      type: "text",
      admin: { position: "sidebar", readOnly: true },
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
      name: "category",
      type: "select",
      required: true,
      defaultValue: "platform",
      options: [
        { label: "Platform", value: "platform" },
        { label: "Agent capability", value: "agent-capability" },
      ],
      admin: {
        position: "sidebar",
        description:
          "Hub-wide triage lane. 'Agent capability' = a missing MCP tool suggested from the /agents catalog.",
      },
    },
    {
      name: "voteCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "communityId",
      type: "text",
      index: true,
      admin: { position: "sidebar" },
    },
  ],
  timestamps: true,
};
