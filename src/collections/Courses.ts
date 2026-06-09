import type { CollectionConfig } from "payload";

export const Courses: CollectionConfig = {
  slug: "courses",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "authorName", "communityId", "status", "enrollmentCount"],
    description: "Member-created classroom courses.",
  },
  fields: [
    { name: "title", type: "text", required: true, maxLength: 200 },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    { name: "summary", type: "text", maxLength: 500 },
    { name: "coverImageUrl", type: "text", admin: { description: "S3 cover image URL (uploaded via /api/upload)." } },
    { name: "authorId", type: "text", required: true, index: true, admin: { description: "Better Auth user ID." } },
    { name: "authorName", type: "text", admin: { readOnly: true } },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Archived", value: "archived" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "communityId", type: "text", required: true, index: true },
    {
      name: "isPublic",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar", description: "Admin-promoted: visible to non-members." },
    },
    { name: "enrollmentCount", type: "number", defaultValue: 0, admin: { readOnly: true } },
  ],
  timestamps: true,
};
