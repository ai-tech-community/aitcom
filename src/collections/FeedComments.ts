import type { CollectionConfig } from "payload";

export const FeedComments: CollectionConfig = {
  slug: "feed-comments",
  admin: {
    useAsTitle: "content",
    defaultColumns: ["post", "authorName", "createdAt"],
    description: "Comments on community feed posts.",
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          const postId = typeof doc.post === "object" ? doc.post.id : doc.post;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload = req.payload as any;
          const post = await payload.findByID({
            collection: "feed-posts",
            id: postId,
          });
          await payload.update({
            collection: "feed-posts",
            id: postId,
            data: { commentCount: (post.commentCount ?? 0) + 1 },
          });
        }
      },
    ],
  },
  fields: [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {
      name: "post",
      type: "relationship",
      relationTo: "feed-posts" as any,
      required: true,
    },
    { name: "content", type: "text", required: true, maxLength: 1000 },
    { name: "authorId", type: "text", required: true, index: true },
    { name: "authorName", type: "text", admin: { readOnly: true } },
    { name: "communityId", type: "text", index: true },
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
