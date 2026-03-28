import type { CollectionConfig } from "payload";

export const FeedLikes: CollectionConfig = {
  slug: "feed-likes",
  admin: {
    useAsTitle: "userId",
    defaultColumns: ["post", "userId", "createdAt"],
    description: "Tracks which users liked which feed posts.",
  },
  fields: [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { name: "post", type: "relationship", relationTo: "feed-posts" as any, required: true },
    { name: "userId", type: "text", required: true, index: true, admin: { description: "Better Auth user ID (UUID)." } },
  ],
  timestamps: true,
};
