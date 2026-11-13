import type { CollectionConfig } from "payload";

import {
  GALLERY_REPORT_REASON_LABELS,
  GALLERY_REPORT_REASONS,
} from "@/lib/gallery-report-reasons";

import { adminsOnly } from "./shared/admins-only";

/**
 * Reports on community gallery items (spec 2026-11-13, "Reports and
 * moderation"), mirroring `post-reports`. Who reported stays private:
 * members reach reports only through the gallery service over tRPC;
 * Payload's own API is for admins. Removing an item deletes its reports
 * (ON DELETE CASCADE).
 */
export const GalleryReports: CollectionConfig = {
  slug: "gallery-reports",
  admin: {
    useAsTitle: "reason",
    defaultColumns: ["item", "reason", "reporterId", "createdAt"],
    description:
      "Reports on community gallery photos and videos. One per reporter per item.",
  },
  access: {
    read: adminsOnly,
    create: adminsOnly,
    update: adminsOnly,
    delete: adminsOnly,
  },
  indexes: [{ fields: ["item", "reporterId"], unique: true }],
  fields: [
    {
      name: "item",
      type: "relationship",
      relationTo: "gallery-items",
      required: true,
      index: true,
    },
    { name: "reporterId", type: "text", required: true, index: true },
    {
      name: "reason",
      type: "select",
      required: true,
      options: GALLERY_REPORT_REASONS.map((value) => ({
        label: GALLERY_REPORT_REASON_LABELS[value],
        value,
      })),
    },
    { name: "note", type: "text", maxLength: 500 },
    {
      // Set when a moderator restores the item. The row stays, so the same
      // reporter can't report it again; only open reports count and show.
      name: "dismissedAt",
      type: "date",
      index: true,
      admin: { position: "sidebar", readOnly: true },
    },
  ],
  timestamps: true,
};
