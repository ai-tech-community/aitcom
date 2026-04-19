export const EVENT_TYPES = ["workshop", "hackathon", "deep_dive", "meetup"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_FOCUS_OPTIONS = ["technical", "marketing", "product", "research", "mixed"] as const;
export type EventFocus = (typeof EVENT_FOCUS_OPTIONS)[number];

export const EVENT_LEVEL_OPTIONS = ["junior", "mid", "senior", "expert", "mixed"] as const;
export type EventLevel = (typeof EVENT_LEVEL_OPTIONS)[number];

export const EVENT_AUDIENCE_OPTIONS = ["engineers", "founders", "marketers", "product", "researchers", "mixed"] as const;
export type EventAudience = (typeof EVENT_AUDIENCE_OPTIONS)[number];

export const EVENT_FORMAT_OPTIONS = ["online", "in-person", "hybrid"] as const;
export type EventFormat = (typeof EVENT_FORMAT_OPTIONS)[number];

export const EVENT_REVIEW_STATUS_OPTIONS = ["discovered", "reviewing", "approved", "archived"] as const;
export type EventReviewStatus = (typeof EVENT_REVIEW_STATUS_OPTIONS)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

export const EVENT_FOCUS_LABELS: Record<EventFocus, string> = {
  technical: "Technical",
  marketing: "Marketing",
  product: "Product",
  research: "Research",
  mixed: "Mixed",
};

export const EVENT_LEVEL_LABELS: Record<EventLevel, string> = {
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  expert: "Expert",
  mixed: "Mixed",
};

export const EVENT_AUDIENCE_LABELS: Record<EventAudience, string> = {
  engineers: "Engineers",
  founders: "Founders",
  marketers: "Marketers",
  product: "Product",
  researchers: "Researchers",
  mixed: "Mixed",
};

export const EVENT_FORMAT_LABELS: Record<EventFormat, string> = {
  online: "Online",
  "in-person": "In Person",
  hybrid: "Hybrid",
};

export const EVENT_REVIEW_STATUS_LABELS: Record<EventReviewStatus, string> = {
  discovered: "Discovered",
  reviewing: "Reviewing",
  approved: "Approved",
  archived: "Archived",
};
