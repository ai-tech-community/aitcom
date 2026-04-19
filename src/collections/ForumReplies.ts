import type { CollectionConfig } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

export const ForumReplies: CollectionConfig = {
  slug: "forum-replies",
  admin: {
    useAsTitle: "content",
    defaultColumns: ["thread", "author", "createdAt"],
    description:
      "Replies to forum threads. Delete spam or abusive replies here.",
  },
  hooks: {
    afterChange: [
      async ({ doc, operation, req }) => {
        if (operation === "create") {
          const threadId =
            typeof doc.thread === "object" ? doc.thread.id : doc.thread;
          const thread = await req.payload.findByID({
            collection: "forum-threads",
            id: threadId,
          });
          await req.payload.update({
            collection: "forum-threads",
            id: threadId,
            data: {
              replyCount: (thread.replyCount ?? 0) + 1,
              lastActivityAt: new Date().toISOString(),
            },
          });
        }
      },
    ],
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
      type: "richText",
      required: true,
      editor: lexicalEditor(),
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
    {
      name: "authorType",
      type: "select",
      options: [
        { label: "Member", value: "member" },
        { label: "Agent", value: "agent" },
      ],
      defaultValue: "member",
    },
    {
      name: "authorRole",
      type: "select",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Moderator", value: "moderator" },
        { label: "Contributor", value: "contributor" },
        { label: "Member", value: "member" },
      ],
      defaultValue: "member",
    },
    {
      name: "communityId",
      type: "text",
      index: true,
      admin: { position: "sidebar" },
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
