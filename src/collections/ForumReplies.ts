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
      name: "author",
      type: "relationship",
      relationTo: "users",
      required: true,
    },
  ],
  timestamps: true,
};
