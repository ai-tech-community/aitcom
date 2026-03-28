import type { CollectionConfig } from "payload";

export const Sponsors: CollectionConfig = {
  slug: "sponsors",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "tier", "status"],
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "logo", type: "upload", relationTo: "media", required: true },
    { name: "website", type: "text" },
    {
      name: "tier",
      type: "select",
      required: true,
      options: [
        { label: "Gold", value: "gold" },
        { label: "Silver", value: "silver" },
        { label: "Bronze", value: "bronze" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "tagline", type: "text", localized: true },
    {
      name: "featured",
      type: "checkbox",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Show on homepage sponsor strip",
      },
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
      admin: { position: "sidebar" },
    },
  ],
};
