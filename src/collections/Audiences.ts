import type { CollectionConfig } from "payload";

const WEEKDAY_OPTIONS = [
  { label: "Monday", value: "mon" },
  { label: "Tuesday", value: "tue" },
  { label: "Wednesday", value: "wed" },
  { label: "Thursday", value: "thu" },
  { label: "Friday", value: "fri" },
  { label: "Saturday", value: "sat" },
  { label: "Sunday", value: "sun" },
];

export const Audiences: CollectionConfig = {
  slug: "audiences",
  access: { read: () => true },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug"],
  },
  fields: [
    { name: "name", type: "text", required: true },
    { name: "slug", type: "text", required: true, unique: true, index: true },
    {
      name: "interests",
      type: "array",
      admin: {
        description:
          "Classifier vocabulary used to map discovered events onto this audience.",
      },
      fields: [{ name: "tag", type: "text", required: true }],
    },
    {
      name: "preferredSlots",
      type: "array",
      admin: {
        description:
          "Weekday x time-of-day ranges when this audience is reachable. Times are interpreted in the event's local timezone.",
      },
      fields: [
        {
          name: "weekdays",
          type: "select",
          hasMany: true,
          options: WEEKDAY_OPTIONS,
        },
        { name: "startTime", type: "text", required: true },
        { name: "endTime", type: "text", required: true },
      ],
    },
    {
      name: "relatedAudiences",
      type: "relationship",
      relationTo: "audiences",
      hasMany: true,
      admin: {
        description:
          "Curated overlap links (e.g. Executives ↔ Founders). Links are treated as bidirectional by the conflict engine even if not stored symmetrically.",
      },
    },
  ],
  timestamps: true,
};
