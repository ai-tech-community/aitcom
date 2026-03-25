import type { CollectionConfig } from "payload";

export const RulesAcceptance: CollectionConfig = {
  slug: "rules-acceptance",
  admin: {
    useAsTitle: "userId",
    defaultColumns: ["userId", "rulesVersion", "acceptedAt"],
    description: "Tracks which users have accepted which version of the community rules.",
  },
  fields: [
    {
      name: "userId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID (UUID)." },
    },
    {
      name: "rulesVersion",
      type: "number",
      required: true,
    },
    {
      name: "communityId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Drizzle community UUID." },
    },
    {
      name: "acceptedAt",
      type: "date",
      required: true,
    },
  ],
  timestamps: true,
};
