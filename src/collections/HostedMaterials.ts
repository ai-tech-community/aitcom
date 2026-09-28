import type { CollectionConfig } from "payload";

import {
  MATERIAL_FILE_NAME_MAX,
  MATERIAL_KINDS,
  MATERIAL_KIND_LABELS,
  MATERIAL_STATUSES,
  MATERIAL_STATUS_LABELS,
  MATERIAL_TITLE_MAX,
  MATERIAL_VISIBILITIES,
  MATERIAL_VISIBILITY_LABELS,
} from "@/lib/classroom/material-rules";

/**
 * Uploaded lesson material (spec 2026-09-27 §2.1). A record belongs to one
 * course and can be used in any of its lessons; lesson bodies hold only its
 * id. Slice 2 stores files only; slice 3 adds video fields in its own
 * migration. No access overrides: like Courses and Lessons, only Payload
 * admins reach it over Payload's own API; members go through tRPC.
 */
export const HostedMaterials: CollectionConfig = {
  slug: "hosted-materials",
  admin: {
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "course",
      "status",
      "visibility",
      "bytes",
      "createdAt",
    ],
    description:
      "Files uploaded into classroom courses. Unfinished uploads are cleaned up daily.",
  },
  fields: [
    { name: "communityId", type: "text", required: true, index: true },
    {
      name: "course",
      type: "number",
      required: true,
      index: true,
      admin: { description: "courses.id" },
    },
    {
      name: "uploaderId",
      type: "text",
      required: true,
      index: true,
      admin: { description: "Better Auth user ID." },
    },
    {
      name: "kind",
      type: "select",
      required: true,
      defaultValue: "file",
      options: MATERIAL_KINDS.map((value) => ({
        label: MATERIAL_KIND_LABELS[value],
        value,
      })),
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "uploading",
      index: true,
      options: MATERIAL_STATUSES.map((value) => ({
        label: MATERIAL_STATUS_LABELS[value],
        value,
      })),
    },
    { name: "failureReason", type: "text" },
    {
      name: "title",
      type: "text",
      required: true,
      maxLength: MATERIAL_TITLE_MAX,
    },
    {
      name: "visibility",
      type: "select",
      required: true,
      defaultValue: "members",
      options: MATERIAL_VISIBILITIES.map((value) => ({
        label: MATERIAL_VISIBILITY_LABELS[value],
        value,
      })),
    },
    {
      name: "fileName",
      type: "text",
      required: true,
      maxLength: MATERIAL_FILE_NAME_MAX,
    },
    { name: "extension", type: "text", required: true },
    { name: "contentType", type: "text", required: true },
    {
      name: "bytes",
      type: "number",
      required: true,
      min: 0,
      admin: {
        description:
          "The size the browser declared at start, kept as is. The upload grant cannot store more, and finish refuses a stored file larger than this.",
      },
    },
    { name: "storageKey", type: "text", required: true, unique: true },
    {
      name: "uploadId",
      type: "text",
      required: true,
      unique: true,
      index: true,
    },
  ],
  timestamps: true,
};
