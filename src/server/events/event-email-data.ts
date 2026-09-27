import { formatEventDayText, formatEventTimeText } from "@/lib/event-time";
import type { Event } from "@/payload-types";
import type { EventEmailData } from "@/server/email";

/** The Payload event fields an event email reads. */
export type EventEmailSource = Pick<
  Event,
  "title" | "date" | "startTime" | "endTime" | "timezone" | "location" | "slug"
>;

/**
 * Event → the details every event email shows (confirmation, cancellation,
 * waitlist promotion), from whichever path sends it: the register mutation
 * or the payment webhook. The day is the event's own calendar day and the
 * time is qualified with its zone, e.g. "15 Jul 2026" and
 * "18:00–21:00 CEST (Europe/Amsterdam)", so the email says when it happens
 * where it happens whatever zone the server runs in.
 */
export function toEventEmailData(event: EventEmailSource): EventEmailData {
  return {
    eventTitle: event.title,
    eventDate: formatEventDayText(event.date),
    eventTime: formatEventTimeText({
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone,
    }),
    eventLocation: event.location,
    eventSlug: event.slug,
  };
}
