import type { CollectionConfig } from "payload";

import { VIDEO_VISIBILITIES, VIDEO_VISIBILITY_LABELS } from "@/lib/video-rules";

export const VideoUploads: CollectionConfig = {
  slug: "video-uploads",
  admin: {
    useAsTitle: "uploadId",
    defaultColumns: [
      "uploadId",
      "userId",
      "communityId",
      "finishedAt",
      "createdAt",
    ],
    description:
      "Upload grants for community videos. Unfinished ones are cleaned up daily.",
  },
  fields: [
    {
      name: "uploadId",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
    { name: "userId", type: "text", required: true, index: true },
    { name: "communityId", type: "text", required: true, index: true },
    {
      name: "visibility",
      type: "select",
      required: true,
      options: VIDEO_VISIBILITIES.map((value) => ({
        label: VIDEO_VISIBILITY_LABELS[value],
        value,
      })),
    },
    { name: "finishedAt", type: "date", index: true },
  ],
  timestamps: true,
};
