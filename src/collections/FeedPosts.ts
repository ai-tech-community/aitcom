import type { CollectionConfig, TextFieldSingleValidation } from "payload";
import { text } from "payload/shared";

import { POST_MAX_LENGTH } from "@/lib/feed-post-rules";
import { VIDEO_VISIBILITIES, VIDEO_VISIBILITY_LABELS } from "@/lib/video-rules";
import { feedPostImageUrlBeforeChange } from "@/server/communities/feed-post-image-url-hook";
import {
  feedPostMentionsAfterChange,
  feedPostMentionsBeforeChange,
} from "@/server/communities/post-mentions";
import { linkPreviewBeforeChange } from "@/server/link-preview/link-preview-hook";

/**
 * A post needs text, except a deleted or moderator-removed one: its content
 * is emptied on purpose, which the plain required check would refuse.
 */
const validateContent: TextFieldSingleValidation = (value, args) =>
  (args.siblingData as { isDeleted?: boolean | null }).isDeleted === true
    ? true
    : text(value, args);

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
    {
      name: "content",
      type: "text",
      required: true,
      maxLength: POST_MAX_LENGTH,
      validate: validateContent,
    },
    {
      // Deprecated: the first picture, mirrored from `images` by the server
      // so the previous version (during a deploy, or after a rollback) and
      // its cleanup job still see it. Dropped by a later migration (#391).
      name: "image",
      type: "upload",
      relationTo: "media",
      unique: true,
      admin: { hidden: true },
    },
    {
      name: "images",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      maxRows: 4,
      admin: {
        description:
          "The post's pictures (up to 4): feed post images its author uploaded, each described by its media alt text. Deleted when the post stops using them.",
      },
    },
    {
      name: "gif",
      type: "group",
      admin: {
        description:
          "A GIF from GIPHY, looked up by the server by its GIPHY id. A post carries one picture, video or GIF, never more.",
      },
      fields: [
        { name: "giphyId", type: "text" },
        { name: "title", type: "text" },
        { name: "mp4Url", type: "text" },
        { name: "stillUrl", type: "text" },
        { name: "width", type: "number" },
        { name: "height", type: "number" },
      ],
    },
    {
      name: "poll",
      type: "group",
      admin: {
        description:
          "A poll: the post's text is the question. Votes live in app.feed_poll_vote. A post carries pictures, a video, a GIF or a poll, never two.",
      },
      fields: [
        {
          name: "options",
          type: "array",
          maxRows: 4,
          fields: [{ name: "label", type: "text", required: true }],
        },
        { name: "closesAt", type: "date" },
      ],
    },
    {
      name: "imageUrl",
      type: "text",
      admin: {
        readOnly: true,
        description:
          "Public URL of the first picture, written by the server so older readers (agents, MCP) get one picture without a join.",
      },
    },
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
      // Who the post's "@Name" mentions point at: [{ userId, name }],
      // checked by the server (members of the post's community only).
      name: "mentions",
      type: "json",
      admin: { readOnly: true },
    },
    {
      name: "linkPreview",
      type: "group",
      admin: {
        readOnly: true,
        description:
          "Preview of the first link in the content, read from that page when the post is saved.",
      },
      fields: [
        { name: "url", type: "text" },
        { name: "title", type: "text" },
        { name: "description", type: "text" },
        { name: "imageUrl", type: "text" },
        { name: "siteName", type: "text" },
        {
          // The author took the preview off their post; the link stays.
          // A new first link brings a preview back.
          name: "hidden",
          type: "checkbox",
          defaultValue: false,
        },
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
  hooks: {
    beforeChange: [
      feedPostImageUrlBeforeChange(),
      linkPreviewBeforeChange(),
      feedPostMentionsBeforeChange(),
    ],
    afterChange: [feedPostMentionsAfterChange()],
  },
  timestamps: true,
};
