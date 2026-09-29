import { env } from "@/env";
import {
  buildEventIcs,
  eventIcsContentType,
  type EventIcsAttendee,
  type EventIcsSource,
} from "@/lib/events/event-ics";
import { externalEventUrl } from "@/lib/events/event-source";
import { EMAIL_SENDER, type EmailCalendarInvite } from "@/server/email";

/**
 * The calendar invite attached to a registration email (`invite`), or the
 * matching withdrawal attached to a cancellation email (`cancel`).
 *
 * Only events AIT Community runs get one. An external event is registered on
 * its own site, which sends its own invite; ours would be a second, possibly
 * wrong, copy in the member's calendar — so this returns undefined.
 */
export function toRegistrationCalendarInvite(
  event: EventIcsSource,
  attendee: EventIcsAttendee,
  method: "invite" | "cancel",
  now: Date = new Date(),
): EmailCalendarInvite | undefined {
  if (externalEventUrl(event) !== null) return undefined;

  return {
    filename: method === "cancel" ? "cancel.ics" : "invite.ics",
    content: buildEventIcs(event, {
      method,
      appUrl: env.NEXT_PUBLIC_APP_URL ?? "https://aitcommunity.org",
      organizer: EMAIL_SENDER,
      attendee,
      now,
    }),
    contentType: eventIcsContentType(method),
  };
}
