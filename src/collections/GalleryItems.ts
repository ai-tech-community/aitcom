import type { CollectionConfig } from "payload";

import {
  GALLERY_ALT_MAX,
  GALLERY_CAPTION_MAX,
  GALLERY_ITEM_STATUSES,
  GALLERY_ITEM_STATUS_LABELS,
  GALLERY_MEDIA_TYPES,
  GALLERY_MEDIA_TYPE_LABELS,
  GALLERY_STORAGE_CLASSES,
  GALLERY_STORAGE_LABELS,
} from "@/lib/gallery-rules";
import { VIDEO_VISIBILITIES, VIDEO_VISIBILITY_LABELS } from "@/lib/video-rules";

import { adminsOnly } from "./shared/admins-only";

/**
 * One photo or video in a community gallery (spec 2026-11-13, Data). Files
 * live in S3 under the gallery prefixes (ADR-0049), never in Payload Media.
 * Members reach items only through the gallery service over tRPC, which
 * checks who may see each one; Payload's own API is for admins.
 */
export const GalleryItems: CollectionConfig = {
  slug: "gallery-items",
  admin: {
    defaultColumns: [
      "communityId",
      "mediaType",
      "status",
      "visibility",
      "uploaderId",
      "createdAt",
    ],
    description:
      "Photos and videos in community galleries. Unfinished uploads are cleaned up daily.",
  },
  access: {
    read: adminsOnly,
    create: adminsOnly,
    update: adminsOnly,
    delete: adminsOnly,
  },
  fields: [
    { name: "communityId", type: "text", required: true, index: true },
    {
      name: "event",
      type: "relationship",
      relationTo: "events",
      index: true,
      admin: {
        description:
          "The event this is from, if any. Only an event of the same community.",
      },
    },
    {
      name: "topicSlug",
      type: "text",
      index: true,
      admin: {
        description:
          "Category: a community-topics slug. Emptied when the topic is deleted.",
      },
    },
    {
      name: "mediaType",
      type: "select",
      required: true,
      options: GALLERY_MEDIA_TYPES.map((value) => ({
        label: GALLERY_MEDIA_TYPE_LABELS[value],
        value,
      })),
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "uploading",
      index: true,
      options: GALLERY_ITEM_STATUSES.map((value) => ({
        label: GALLERY_ITEM_STATUS_LABELS[value],
        value,
      })),
      admin: { description: "Only ready items are ever shown." },
    },
    { name: "failureReason", type: "text" },
    {
      name: "storage",
      type: "select",
      required: true,
      options: GALLERY_STORAGE_CLASSES.map((value) => ({
        label: GALLERY_STORAGE_LABELS[value],
        value,
      })),
      admin: {
        description:
          "Where the files are kept, from the visibility at upload. Never changes.",
      },
    },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "community",
      options: VIDEO_VISIBILITIES.map((value) => ({
        label: VIDEO_VISIBILITY_LABELS[value],
        value,
      })),
    },
    { name: "fileKey", type: "text", required: true, unique: true },
    { name: "thumbnailKey", type: "text", required: true },
    { name: "width", type: "number", required: true, min: 1 },
    { name: "height", type: "number", required: true, min: 1 },
    {
      name: "bytes",
      type: "number",
      required: true,
      min: 0,
      admin: {
        description:
          "Size of the file plus its thumbnail, as declared at start. Counts toward the community's media allowance.",
      },
    },
    {
      name: "durationSeconds",
      type: "number",
      min: 0,
      admin: { description: "Videos only, as reported by the uploader." },
    },
    { name: "caption", type: "text", maxLength: GALLERY_CAPTION_MAX },
    {
      name: "alt",
      type: "text",
      maxLength: GALLERY_ALT_MAX,
      admin: {
        description:
          "Description for screen readers. When empty, one is generated from the event and uploader.",
      },
    },
    {
      name: "uploaderId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID." },
    },
    {
      name: "batch",
      type: "relationship",
      relationTo: "gallery-batches",
      required: true,
      index: true,
    },
    {
      name: "uploadId",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    {
      name: "magazineConsent",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "The uploader let the community use this in its magazine. Editors can only pick items with this ticked.",
      },
    },
    { name: "magazineConsentAt", type: "date" },
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
