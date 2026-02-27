import type { CollectionConfig } from "payload";
import { lexicalEditor } from "@payloadcms/richtext-lexical";

export const ForumThreads: CollectionConfig = {
  slug: "forum-threads",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "category", "isPinned", "replyCount", "createdAt"],
    description: "Community discussion threads. Pin important threads, lock spam, delete abuse.",
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { description: "Auto-generated from title + timestamp. Do not edit manually." },
    },
    {
      name: "content",
      type: "richText",
      required: true,
      editor: lexicalEditor(),
    },
    {
      name: "category",
      type: "select",
      required: true,
      defaultValue: "general",
      options: [
        { label: "General", value: "general" },
        { label: "Question", value: "question" },
        { label: "Showcase", value: "showcase" },
        { label: "Jobs", value: "job" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "authorId",
      type: "text",
      required: true,
      admin: { position: "sidebar", description: "Better Auth user ID (UUID)." },
    },
    {
      name: "authorName",
      type: "text",
      admin: { position: "sidebar", readOnly: true },
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
      name: "isPinned",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", description: "Pinned threads appear at the top." },
    },
    {
      name: "isLocked",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", description: "Locked threads cannot receive new replies." },
    },
    {
      name: "viewCount",
      type: "number",
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: "replyCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "lastActivityAt",
      type: "date",
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
