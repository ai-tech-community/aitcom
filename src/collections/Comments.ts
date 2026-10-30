import type { CollectionConfig } from "payload";

export const Comments: CollectionConfig = {
  slug: "comments",
  admin: {
    useAsTitle: "content",
    defaultColumns: ["content", "articleId", "authorName", "createdAt"],
  },
  access: {
    // Comments are as private as their article (ADR-0042), and only the app
    // knows who may read which article: it reads comments through the
    // Local API after `canReadArticle`. Payload's own REST and GraphQL
    // reads are for signed-in Payload admins only, so a members-only
    // article's comments never leak through /api/comments.
    read: ({ req }) => Boolean(req.user),
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
