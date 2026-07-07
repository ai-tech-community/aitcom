/**
 * Editorial seed data for the `audiences` collection, shared by the
 * `20260707a_audiences_collection_seed` migration and its tests.
 *
 * Slugs are the stable public vocabulary (CONTEXT.md [[audience]]): the
 * first six MUST exactly equal the legacy `EVENT_AUDIENCE_OPTIONS` enum
 * values (src/lib/event-metadata.ts) because a later task migrates the
 * `events.audience` select field to a relationship pointing at these rows.
 */

export const WEEKDAY_VALUES = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type Weekday = (typeof WEEKDAY_VALUES)[number];

export interface AudienceSeedSlot {
  /** Interpreted in the event's local timezone (CONTEXT.md [[preferred-time-slot]]). */
  weekdays: Weekday[];
  /** "HH:MM", 24-hour */
  startTime: string;
  /** "HH:MM", 24-hour, strictly after startTime */
  endTime: string;
}

export interface AudienceSeedEntry {
  slug: string;
  name: string;
  interests: string[];
  preferredSlots: AudienceSeedSlot[];
  /** Slugs of curated related audiences; the conflict engine treats links as bidirectional. */
  relatedAudiences: string[];
}

export const AUDIENCE_SEED: AudienceSeedEntry[] = [
  {
    slug: "engineers",
    name: "Engineers",
    interests: ["ai", "engineering", "llms"],
    preferredSlots: [
      { weekdays: ["tue", "wed", "thu"], startTime: "18:00", endTime: "21:00" },
      { weekdays: ["sat"], startTime: "10:00", endTime: "13:00" },
    ],
    relatedAudiences: [],
  },
  {
    slug: "founders",
    name: "Founders",
    interests: ["startups", "fundraising", "ai"],
    preferredSlots: [
      { weekdays: ["tue", "wed", "thu"], startTime: "17:00", endTime: "20:00" },
    ],
    relatedAudiences: ["executives"],
  },
  {
    slug: "marketers",
    name: "Marketers",
    interests: [],
    preferredSlots: [
      { weekdays: ["tue", "wed", "thu"], startTime: "16:00", endTime: "18:00" },
    ],
    relatedAudiences: [],
  },
  {
    slug: "product",
    name: "Product",
    interests: [],
    preferredSlots: [
      { weekdays: ["tue", "wed", "thu"], startTime: "17:00", endTime: "19:00" },
    ],
    relatedAudiences: [],
  },
  {
    slug: "researchers",
    name: "Researchers",
    interests: [],
    preferredSlots: [
      { weekdays: ["wed", "thu"], startTime: "15:00", endTime: "18:00" },
    ],
    relatedAudiences: [],
  },
  {
    slug: "mixed",
    name: "Mixed",
    interests: [],
    preferredSlots: [
      { weekdays: ["tue", "wed", "thu"], startTime: "18:00", endTime: "20:00" },
    ],
    relatedAudiences: [],
  },
  {
    slug: "executives",
    name: "Executives",
    interests: ["leadership", "strategy", "ai"],
    preferredSlots: [
      { weekdays: ["tue", "wed", "thu"], startTime: "08:00", endTime: "10:00" },
      { weekdays: ["tue", "wed", "thu"], startTime: "17:00", endTime: "19:00" },
    ],
    relatedAudiences: ["founders"],
  },
];
