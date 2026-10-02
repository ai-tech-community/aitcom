import type { Payload } from "payload";

import type { AppLocale } from "@/i18n/messages";
import type { db as _db } from "@/server/db";
import type { MyEventRegistrationStatus } from "@/server/events/my-event-pairs";

type DB = typeof _db;

/**
 * Where an item belongs in Next up, in display order:
 *
 * - `timeBound`: has a moment it is about (an event's start, a challenge's
 *   deadline); these sort among themselves by `at`, soonest first.
 * - `actionNeeded`: waits on the member (an invite, join requests to review).
 * - `ongoing`: work in progress with no deadline (an open-ended challenge).
 * - `catchUp`: things to read (unread notifications and messages).
 */
export const NEXT_UP_TIERS = [
  "timeBound",
  "actionNeeded",
  "ongoing",
  "catchUp",
] as const;

export type NextUpTier = (typeof NEXT_UP_TIERS)[number];

/** How an item ranks. Each loader sets it from its own data. */
export type NextUpUrgency =
  | { tier: "timeBound"; at: string }
  | { tier: Exclude<NextUpTier, "timeBound"> };

type NextUpBase<K extends string> = {
  kind: K;
  /** Unique and stable across reads; the client's React key. */
  key: string;
  urgency: NextUpUrgency;
};

/** Registration statuses an upcoming event can have (attended ones are past). */
export type UpcomingRegistrationStatus = Exclude<
  MyEventRegistrationStatus,
  "attended"
>;

export type NextUpEventItem = NextUpBase<"event"> & {
  eventId: number;
  slug: string;
  title: string;
  /** ISO instant, judged in the event's own zone. */
  startsAt: string;
  registration: UpcomingRegistrationStatus;
};

export type NextUpChallengeItem = NextUpBase<"challenge"> & {
  challengeId: number;
  slug: string;
  title: string;
  /** ISO instant of the deadline; null for an open-ended challenge. */
  endsAt: string | null;
};

export type NextUpInviteItem = NextUpBase<"invite"> & {
  communityId: string;
  slug: string;
  name: string;
};

export type NextUpJoinRequestsItem = NextUpBase<"joinRequests"> & {
  communityId: string;
  slug: string;
  name: string;
  /** Pending requests waiting for review; always more than zero. */
  count: number;
};

export type NextUpUnreadItem = NextUpBase<"unread"> & {
  notifications: number;
  messages: number;
};

/**
 * One thing the member could do next. A discriminated union on `kind`: a new
 * kind of next action is a new member here, a new loader, one line in the
 * loader list and one row renderer.
 */
export type NextUpItem =
  | NextUpEventItem
  | NextUpChallengeItem
  | NextUpInviteItem
  | NextUpJoinRequestsItem
  | NextUpUnreadItem;

export type NextUpKind = NextUpItem["kind"];

export type NextUpResult = {
  items: NextUpItem[];
  /** True when at least one source failed and its items are missing. */
  partial: boolean;
};

/** The slice of Payload loaders read, so tests can stand in for it. */
export type NextUpPayload = Pick<Payload, "find">;

/** What every loader gets. */
export type NextUpContext = {
  db: DB;
  userId: string;
  locale: AppLocale;
  now: Date;
  /** Lazy: a loader with nothing to look up never starts Payload. */
  getPayload: () => Promise<NextUpPayload>;
};

/** One source of Next up items. */
export type NextUpLoader = {
  /** For logs when the loader fails. */
  name: string;
  load: (ctx: NextUpContext) => Promise<NextUpItem[]>;
};
