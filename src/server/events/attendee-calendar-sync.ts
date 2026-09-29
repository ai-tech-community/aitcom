import { and, eq } from "drizzle-orm";

import type { EventIcsSource } from "@/lib/events/event-ics";
import { externalEventUrl } from "@/lib/events/event-source";
import { db as defaultDb } from "@/server/db";
import { eventRegistrations, user } from "@/server/db/schema";
import { sendEventCancelledEmail, sendEventChangedEmail } from "@/server/email";
import { toEventEmailData } from "@/server/events/event-email-data";
import { toRegistrationCalendarInvite } from "@/server/events/registration-invite";

/** What a saved change means for the invites already in members' calendars. */
export type AttendeeCalendarChange = "update" | "cancel";

/** The event fields a calendar invite shows; a change to any of them is news. */
const INVITE_FIELDS = [
  "title",
  "date",
  "startTime",
  "endTime",
  "timezone",
  "location",
] as const satisfies readonly (keyof EventIcsSource)[];

function sameValue(a: unknown, b: unknown): boolean {
  return (a ?? null) === (b ?? null);
}

/**
 * Compare the live event — the row members see — just before and just after
 * a save.
 *
 * - `cancel` — it just became cancelled.
 * - `update` — it is still on, and its name, day, time, zone or place moved.
 * - null — nothing an attendee's calendar shows changed, or it is an external
 *   event (its own site sends its own updates).
 *
 * Compare live rows, not Payload's `previousDoc`/`doc`: with drafts enabled,
 * `previousDoc` is the latest version (possibly an unpublished draft) and a
 * draft save hands back the draft. Diffing those would email members about a
 * draft nobody can see, and stay silent when that draft is later published.
 * A draft save leaves the live row alone, so here it simply shows no change.
 */
export function attendeeCalendarChange(
  liveBefore: EventIcsSource | null | undefined,
  liveAfter: EventIcsSource | null | undefined,
): AttendeeCalendarChange | null {
  if (!liveBefore || !liveAfter) return null;
  if (externalEventUrl(liveAfter) !== null) return null;

  const wasCancelled = liveBefore.status === "cancelled";
  const isCancelled = liveAfter.status === "cancelled";
  if (isCancelled) return wasCancelled ? null : "cancel";
  if (wasCancelled) return null;

  const moved = INVITE_FIELDS.some(
    (field) => !sameValue(liveAfter[field], liveBefore[field]),
  );
  return moved ? "update" : null;
}

type Db = typeof defaultDb;

/**
 * Mail every member holding a seat at the event: an updated invite when it
 * moved, a calendar cancel when it was cancelled. One email at a time, like
 * the reminder and broadcast senders, so a big event stays under the mail
 * provider's rate limit. A failed send is logged and skipped; it never
 * blocks the others.
 */
export async function notifyAttendeesOfEventChange(
  event: EventIcsSource,
  change: AttendeeCalendarChange,
  db: Db = defaultDb,
): Promise<{ attendees: number; emailed: number }> {
  const attendees = await db
    .select({ name: user.name, email: user.email })
    .from(eventRegistrations)
    .innerJoin(user, eq(eventRegistrations.userId, user.id))
    .where(
      and(
        eq(eventRegistrations.eventId, event.id),
        eq(eventRegistrations.status, "registered"),
      ),
    );

  const eventData = toEventEmailData(event);
  const send =
    change === "cancel" ? sendEventCancelledEmail : sendEventChangedEmail;
  const method = change === "cancel" ? "cancel" : "invite";

  let emailed = 0;
  for (const attendee of attendees) {
    if (!attendee.email) continue;
    try {
      const sent = await send(
        attendee.email,
        attendee.name ?? "there",
        eventData,
        toRegistrationCalendarInvite(
          event,
          { email: attendee.email, name: attendee.name },
          method,
        ),
      );
      if (sent) emailed++;
    } catch (e) {
      console.error(
        `Failed to send event ${change} email for event ${event.id}:`,
        e,
      );
    }
  }
  return { attendees: attendees.length, emailed };
}
