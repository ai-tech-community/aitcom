import type { CollectionConfig } from "payload";

export const ForumReplies: CollectionConfig = {
  slug: "forum-replies",
  admin: {
    useAsTitle: "content",
    defaultColumns: ["thread", "author", "createdAt"],
    description: "Replies to forum threads. Delete spam or abusive replies here.",
  },
  fields: [
    {
      name: "thread",
      type: "relationship",
      relationTo: "forum-threads",
      required: true,
    },
    {
      name: "content",
      type: "textarea",
      required: true,
    },
    {
      name: "authorId",
      type: "text",
      required: true,
      admin: { description: "Better Auth user ID (UUID)." },
    },
    {
      name: "authorName",
      type: "text",
      admin: { readOnly: true },
    },
  ],
  timestamps: true,
};
