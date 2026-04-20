import type { CollectionConfig } from "payload";

export const Brands: CollectionConfig = {
  slug: "brands",
  dbName: "brand",
  admin: {
    useAsTitle: "canonicalName",
    defaultColumns: ["canonicalName", "slug", "verified", "createdAt"],
    description:
      "Canonical brand registry used for brand-bias benchmark scoring.",
  },
  fields: [
    {
      name: "canonicalName",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    {
      name: "aliases",
      type: "array",
      admin: {
        description: "Alternative names/spellings that map to this brand.",
      },
      fields: [
        {
          name: "value",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "website",
      type: "text",
      admin: { position: "sidebar" },
    },
    {
      name: "categoryIds",
      type: "relationship",
      relationTo: "benchmark-categories",
      hasMany: true,
      admin: { position: "sidebar" },
    },
    {
      name: "verified",
      type: "checkbox",
      defaultValue: false,
      admin: { position: "sidebar" },
    },
  ],
};
