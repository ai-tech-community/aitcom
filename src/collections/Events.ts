import type { CollectionConfig } from "payload";

export const Events: CollectionConfig = {
  slug: "events",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "date", "status"],
  },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", required: true, localized: true },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: { position: "sidebar" },
    },
    { name: "description", type: "richText", required: true, localized: true },
    {
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Workshop", value: "workshop" },
        { label: "Hackathon", value: "hackathon" },
        { label: "Deep Dive", value: "deep_dive" },
        { label: "Meetup", value: "meetup" },
      ],
    },
    {
      name: "date",
      type: "date",
      required: true,
      admin: { position: "sidebar" },
    },
    { name: "startTime", type: "text" },
    { name: "endTime", type: "text" },
    { name: "location", type: "text", required: true },
    { name: "maxAttendees", type: "number" },
    {
      name: "price",
      type: "number",
      admin: {
        description:
          "Price in EUR cents (e.g. 1500 = €15.00). Leave empty for free events.",
        position: "sidebar",
      },
    },
    { name: "image", type: "upload", relationTo: "media" },
    {
      name: "speakers",
      type: "relationship",
      relationTo: "speakers",
      hasMany: true,
    },
    {
      name: "status",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Published", value: "published" },
        { label: "Cancelled", value: "cancelled" },
        { label: "Completed", value: "completed" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "communityId",
      type: "text",
      index: true,
      admin: { position: "sidebar" },
    },
  ],
};
