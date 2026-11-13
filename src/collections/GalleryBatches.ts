import type { CollectionConfig } from "payload";

import {
  GALLERY_BATCH_STATUSES,
  GALLERY_BATCH_STATUS_LABELS,
  GALLERY_BATCH_TEXT_MAX,
  GALLERY_MAX_FILES_PER_BATCH,
  GALLERY_MAX_VIDEOS_PER_BATCH,
} from "@/lib/gallery-rules";
import { VIDEO_VISIBILITIES, VIDEO_VISIBILITY_LABELS } from "@/lib/video-rules";

import { adminsOnly } from "./shared/admins-only";

/**
 * One upload of several gallery photos and videos (spec 2026-11-13, Upload
 * flow). It holds the settings chosen once in the upload dialog and the plan
 * the per-file grants are checked against; each file becomes a
 * `gallery-items` row pointing here. Members reach it only through the
 * gallery service over tRPC.
 */
export const GalleryBatches: CollectionConfig = {
  slug: "gallery-batches",
  admin: {
    defaultColumns: [
      "communityId",
      "uploaderId",
      "status",
      "plannedFiles",
      "createdAt",
    ],
    description:
      "One upload of photos and videos to a community gallery. Batches left open are closed by the daily cleanup.",
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
      name: "uploaderId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID." },
    },
    {
      name: "event",
      type: "relationship",
      relationTo: "events",
      index: true,
      admin: {
        description:
          "The community event these photos are from, if any. Every item in the batch starts with this event.",
      },
    },
    {
      name: "topicSlug",
      type: "text",
      admin: {
        description:
          "Category for every item in the batch: a community-topics slug.",
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
    {
      name: "magazineConsent",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "The uploader let the community use these in its magazine.",
      },
    },
    { name: "magazineConsentAt", type: "date" },
    {
      name: "caption",
      type: "text",
      maxLength: GALLERY_BATCH_TEXT_MAX,
      admin: {
        description:
          "What the uploader said about these. It goes on the feed post only, not on the items.",
      },
    },
    {
      name: "plannedFiles",
      type: "number",
      required: true,
      min: 1,
      max: GALLERY_MAX_FILES_PER_BATCH,
      admin: {
        description: "How many files the uploader chose. No more are accepted.",
      },
    },
    {
      name: "plannedVideos",
      type: "number",
      required: true,
      min: 0,
      max: GALLERY_MAX_VIDEOS_PER_BATCH,
      admin: {
        description:
          "How many of those files are videos. No more videos are accepted.",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "open",
      index: true,
      options: GALLERY_BATCH_STATUSES.map((value) => ({
        label: GALLERY_BATCH_STATUS_LABELS[value],
        value,
      })),
    },
    {
      name: "feedPostId",
      type: "number",
      admin: {
        description:
          "feed-posts.id of the post that announced this batch, if one was made.",
      },
    },
  ],
  timestamps: true,
};
