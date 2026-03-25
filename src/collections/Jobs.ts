import type { CollectionConfig } from "payload";

export const Jobs: CollectionConfig = {
  slug: "jobs",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "sponsor", "type", "status"],
  },
  fields: [
    { name: "title", type: "text", required: true },
    {
      name: "sponsor",
      type: "relationship",
      relationTo: "sponsors",
      required: true,
    },
    { name: "description", type: "richText", required: true },
    { name: "location", type: "text", required: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Remote", value: "remote" },
        { label: "Hybrid", value: "hybrid" },
        { label: "On-site", value: "onsite" },
      ],
    },
    {
      name: "url",
      type: "text",
      required: true,
      admin: { description: "External apply link" },
    },
    {
      name: "tags",
      type: "array",
      fields: [{ name: "tag", type: "text", required: true }],
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "active",
      options: [
        { label: "Active", value: "active" },
        { label: "Expired", value: "expired" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "postedAt",
      type: "date",
      admin: { position: "sidebar" },
    },
    {
      name: "expiresAt",
      type: "date",
      admin: { position: "sidebar" },
    },
    {
      name: "communityId",
      type: "text",
      index: true,
      admin: { position: "sidebar" },
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        if (operation === "create" && data && !data.postedAt) {
          data.postedAt = new Date().toISOString();
        }
        return data;
      },
    ],
  },
};
