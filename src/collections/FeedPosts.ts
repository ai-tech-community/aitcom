import type { CollectionConfig } from "payload";

export const FeedPosts: CollectionConfig = {
  slug: "feed-posts",
  admin: {
    useAsTitle: "content",
    defaultColumns: [
      "content",
      "authorName",
      "communityId",
      "likeCount",
      "createdAt",
    ],
    description: "Community feed posts.",
  },
  fields: [
    { name: "content", type: "text", required: true, maxLength: 2000 },
    { name: "imageUrl", type: "text", admin: { description: "S3 image URL." } },
    {
      name: "authorId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID (UUID)." },
    },
    { name: "authorName", type: "text", admin: { readOnly: true } },
    { name: "communityId", type: "text", index: true },
    {
      name: "likeCount",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: "commentCount",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: "isDeleted",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar" },
    },
    {
      name: "isEdited",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "editedAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
