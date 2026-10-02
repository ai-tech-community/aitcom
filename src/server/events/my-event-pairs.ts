import { and, eq, inArray } from "drizzle-orm";
import type { Payload, Where } from "payload";

import type { AppLocale } from "@/i18n/messages";
import type { Event } from "@/payload-types";
import type { db as _db } from "@/server/db";
import { eventRegistrations } from "@/server/db/schema";

type DB = typeof _db;

/** The slice of Payload this read needs, so tests can stand in for it. */
export type EventFinder = Pick<Payload, "find">;

/**
 * Registration statuses that make an event "one of mine". Cancelled and
 * failed-payment registrations are not: the member is no longer going.
 */
export const MY_EVENT_REGISTRATION_STATUSES = [
  "registered",
  "waitlisted",
  "attended",
  "intent",
  "pending_payment",
] as const;

export type MyEventRegistrationStatus =
  (typeof MY_EVENT_REGISTRATION_STATUSES)[number];

export type MyEventRegistration = typeof eventRegistrations.$inferSelect & {
  status: MyEventRegistrationStatus;
};

/**
 * Event statuses that never count as "one of my events": not approved
 * (draft, rejected — the event page 404s on them) or called off
 * (cancelled — there is nothing to go to, and the rows would still read
 * "Registered").
 */
export const EXCLUDED_MY_EVENT_STATUSES = [
  "draft",
  "rejected",
  "cancelled",
] as const;

/** A member's registration paired with the event it is for. */
export interface MyEventRegistrationPair {
  registration: MyEventRegistration;
  event: Event;
}

/**
 * The member's registrations (see `MY_EVENT_REGISTRATION_STATUSES`), each
 * paired with its event in the member's locale. Events in an
 * `EXCLUDED_MY_EVENT_STATUSES` status are left out. One registration query and
 * one batched Payload lookup; Payload is not touched when there is nothing
 * to look up. A registration whose event no longer exists (or is filtered
 * out by `where`) is dropped. Split the result with `splitMyEvents`.
 */
export async function loadMyEventPairs(
  { db, getPayload }: { db: DB; getPayload: () => Promise<EventFinder> },
  {
    userId,
    locale,
    where,
  }: {
    userId: string;
    locale: AppLocale;
    /** Extra event conditions, ANDed with the id lookup. */
    where?: Where;
  },
): Promise<MyEventRegistrationPair[]> {
  const registrations = (await db
    .select()
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.userId, userId),
        inArray(eventRegistrations.status, [...MY_EVENT_REGISTRATION_STATUSES]),
      ),
    )) as MyEventRegistration[];

  const eventIds = [...new Set(registrations.map((r) => r.eventId))];
  if (eventIds.length === 0) return [];

  const payload = await getPayload();
  const conditions: Where[] = [
    { id: { in: eventIds } },
    { status: { not_in: [...EXCLUDED_MY_EVENT_STATUSES] } },
  ];
  if (where) conditions.push(where);
  const { docs } = await payload.find({
    collection: "events",
    where: { and: conditions },
    locale,
    limit: eventIds.length,
    depth: 0,
  });
  const events = new Map(docs.map((event) => [event.id, event]));

  return registrations.flatMap((registration) => {
    const event = events.get(registration.eventId);
    return event ? [{ registration, event }] : [];
  });
}
