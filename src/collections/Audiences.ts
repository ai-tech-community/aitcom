import type { CollectionConfig } from "payload";

import { WEEKDAY_VALUES } from "@/lib/audience-seed";

const WEEKDAY_LABELS: Record<(typeof WEEKDAY_VALUES)[number], string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

const WEEKDAY_OPTIONS = WEEKDAY_VALUES.map((value) => ({
  label: WEEKDAY_LABELS[value],
  value,
}));

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
          required: true,
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
