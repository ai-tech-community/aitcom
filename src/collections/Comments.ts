import type { CollectionConfig } from "payload";

export const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    useAsTitle: "content",
    defaultColumns: ["content", "articleId", "authorName", "createdAt"],
  },
  access: {
    read: () => true,
  },
  fields: [
    { name: "articleId", type: "number", required: true, index: true },
    { name: "parentId", type: "number", index: true },
    {
      name: "content",
      type: "textarea",
      required: true,
      maxLength: 5000,
    },
    { name: "authorId", type: "text", required: true, index: true },
    { name: "authorName", type: "text" },
    {
      name: "communityId",
      type: "text",
      index: true,
      admin: { position: "sidebar" },
    },
  ],
};
