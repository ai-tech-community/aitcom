import type { CollectionConfig } from "payload";

/**
 * Admin-managed XP boost campaigns. A boost is "active" when `enabled` and the
 * current time falls within [startsAt, endsAt]; awardXp multiplies earned XP by
 * the active boost's `multiplier`, and the member dashboard shows a banner.
 */
export const PointsBoosts: CollectionConfig = {
  slug: "points-boosts",
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "multiplier", "startsAt", "endsAt", "enabled"],
    group: "Gamification",
  },
  fields: [
    { name: "name", type: "text", required: true },
    {
      name: "multiplier",
      type: "number",
      required: true,
      defaultValue: 2,
      min: 1,
      admin: {
        description: "XP is multiplied by this while the boost is live.",
      },
    },
    {
      name: "startsAt",
      type: "date",
      required: true,
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "endsAt",
      type: "date",
      required: true,
      admin: { date: { pickerAppearance: "dayAndTime" } },
    },
    { name: "description", type: "textarea" },
    {
      name: "ctaText",
      type: "text",
      admin: { description: "Optional call-to-action label on the banner." },
    },
    { name: "ctaLink", type: "text" },
    {
      name: "enabled",
      type: "checkbox",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Turn the boost off without changing its dates.",
      },
    },
  ],
};
