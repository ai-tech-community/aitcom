import type { CollectionConfig } from "payload";

export const IdeaVotes: CollectionConfig = {
  slug: "idea-votes",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["idea", "voter", "createdAt"],
    description: "Tracks which users have voted for which ideas. One vote per user per idea (enforced by hook).",
  },
  hooks: {
    beforeChange: [
      async ({ data, operation, req }) => {
        // Prevent double-voting: on create, check if this (idea, voter) pair already exists
        if (operation === "create") {
          const { docs } = await req.payload.find({
            collection: "idea-votes",
            where: {
              and: [
                { idea: { equals: data.idea } },
                { voter: { equals: data.voter } },
              ],
            },
            limit: 1,
          });
          if (docs.length > 0) {
            throw new Error("You have already voted for this idea.");
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "idea",
      type: "relationship",
      relationTo: "community-ideas",
      required: true,
    },
    {
      name: "voter",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
  ],
  timestamps: true,
};
