import type { CollectionConfig } from "payload";

import { VIDEO_VISIBILITIES, VIDEO_VISIBILITY_LABELS } from "@/lib/video-rules";

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
      name: "topicSlug",
      type: "text",
      index: true,
      required: true,
      defaultValue: "general",
      admin: {
        description:
          "Slug of the community-topics row this post belongs to. 'general' by default.",
      },
    },
    {
      name: "isPinned",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Pinned posts appear first on the All view.",
      },
    },
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
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "community",
      index: true,
      options: VIDEO_VISIBILITIES.map((value) => ({
        label: VIDEO_VISIBILITY_LABELS[value],
        value,
      })),
      admin: {
        position: "sidebar",
        description: "Only video posts may be public. Fixed after posting.",
      },
    },
    {
      name: "video",
      type: "group",
      admin: { description: "Set on video posts only. See ADR-0036." },
      fields: [
        // Unique: a concurrent double-submit of the same upload cannot
        // create two posts. Postgres UNIQUE allows many NULLs (text posts).
        { name: "key", type: "text", unique: true },
        { name: "thumbnailKey", type: "text" },
        {
          name: "storage",
          type: "select",
          options: [
            { label: "Public", value: "public" },
            { label: "Private", value: "private" },
          ],
        },
        { name: "durationSeconds", type: "number" },
        { name: "width", type: "number" },
        { name: "height", type: "number" },
        { name: "bytes", type: "number" },
      ],
    },
    {
      name: "hiddenAt",
      type: "date",
      index: true,
      admin: {
        position: "sidebar",
        description:
          "Set by the first report; cleared when a moderator restores.",
      },
    },
    {
      name: "reportCount",
      type: "number",
      defaultValue: 0,
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
