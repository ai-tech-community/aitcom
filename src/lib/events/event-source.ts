import type { Event } from "@/payload-types";

/**
 * The third-party page an event was imported from, or null when AIT Community
 * runs the event itself.
 *
 * This is the one rule for "external event": when it returns a URL, people
 * register on that site (we only record that they are going), and we never
 * register them here or send them our own calendar invite.
 */
export function externalEventUrl(
  event: Pick<Event, "sourceUrl">,
): string | null {
  return typeof event.sourceUrl === "string" && event.sourceUrl.length > 0
    ? event.sourceUrl
    : null;
}
