import type { CollectionConfig } from "payload";
import { incrementNumeric } from "@/server/payload-numeric";

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
        if (operation !== "create") return;
        try {
          const postId = typeof doc.post === "object" ? doc.post.id : doc.post;
          const post = await req.payload.findByID({
            collection: "feed-posts",
            id: postId,
            depth: 0,
            overrideAccess: true,
          });
          await req.payload.update({
            collection: "feed-posts",
            id: postId,
            overrideAccess: true,
            data: { commentCount: incrementNumeric(post.commentCount) },
          });
        } catch (err) {
          console.error(
            "[feed-comments] failed to increment post commentCount",
            err,
          );
        }
      },
    ],
  },
  fields: [
    {
      name: "post",
      type: "relationship",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
