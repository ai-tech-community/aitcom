import { isValidTimeZone } from "@/lib/event-time";
import { externalEventUrl } from "@/lib/events/event-source";
import type { Event } from "@/payload-types";

/** The Payload event fields an iCalendar entry reads. */
export type EventIcsSource = Pick<
  Event,
  | "id"
  | "slug"
  | "title"
  | "summary"
  | "date"
  | "startTime"
  | "endTime"
  | "timezone"
  | "location"
  | "sourceUrl"
  | "status"
>;

/**
 * What the calendar file is for (RFC 5546 iTIP methods):
 * - `publish` — a plain "add to calendar" download, no people attached.
 * - `invite` — a registration invite addressed to one attendee (REQUEST).
 * - `cancel` — withdraws that invite from the attendee's calendar (CANCEL).
 */
export type EventIcsMethod = "publish" | "invite" | "cancel";

export interface EventIcsAttendee {
  email: string;
  name?: string | null;
}

export interface EventIcsOrganizer {
  email: string;
  name: string;
}

export type EventIcsOptions =
  | { method: "publish"; appUrl: string; now?: Date }
  | {
      method: "invite" | "cancel";
      appUrl: string;
      organizer: EventIcsOrganizer;
      attendee: EventIcsAttendee;
      now?: Date;
    };

const ICS_METHOD: Record<EventIcsMethod, string> = {
  publish: "PUBLISH",
  invite: "REQUEST",
  cancel: "CANCEL",
};

/** The MIME type a mail client needs to show an attached file as an invite. */
export function eventIcsContentType(method: EventIcsMethod): string {
  return `text/calendar; charset=utf-8; method=${ICS_METHOD[method]}`;
}

/**
 * One stable UID per event, shared by the download and every invite, so a
 * calendar that already holds the event updates it instead of adding a copy,
 * and an update or cancel lands on the entry the invite created. Built from
 * the id alone: organizers can rename the slug, and a UID that changed with
 * it would leave members with a stale copy.
 */
export function eventIcsUid(event: Pick<Event, "id">): string {
  return `event-${event.id}@aitcommunity.org`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toIcsDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

function toIcsFloating(dateStr: string, time: string): string {
  const datePart = toIcsDate(dateStr);
  const [hh = "00", mm = "00"] = time.split(":");
  return `${datePart}T${pad(Number(hh))}${pad(Number(mm))}00`;
}

function toIcsUtcStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Parameter values (CN=...) cannot hold these characters unquoted. */
function quoteIcsParam(value: string): string {
  return `"${value.replace(/"/g, "'")}"`;
}

function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let remaining = line;
  chunks.push(remaining.slice(0, 75));
  remaining = remaining.slice(75);
  while (remaining.length > 0) {
    chunks.push(" " + remaining.slice(0, 74));
    remaining = remaining.slice(74);
  }
  return chunks.join("\r\n");
}

/**
 * Event → an iCalendar (RFC 5545) document with one VEVENT.
 *
 * Wall-clock times are qualified with the event's IANA timezone when it has
 * one (major calendar clients resolve bare IANA TZIDs); legacy events without
 * a timezone keep floating local times. Invites and cancels carry the
 * organizer, the one attendee, and a SEQUENCE taken from the send time, so a
 * later message (a cancel, or a re-registration after one) always wins over
 * an earlier one for the same UID.
 */
export function buildEventIcs(
  event: EventIcsSource,
  options: EventIcsOptions,
): string {
  const now = options.now ?? new Date();
  const eventUrl = `${options.appUrl}/events/${event.slug}`;
  const sourceUrl = externalEventUrl(event);

  const startTime =
    typeof event.startTime === "string" && event.startTime
      ? event.startTime
      : null;
  const tzid = isValidTimeZone(event.timezone) ? event.timezone : null;
  const tzParam = tzid ? `;TZID=${tzid}` : "";

  const dtStartLine = startTime
    ? `DTSTART${tzParam}:${toIcsFloating(event.date, startTime)}`
    : `DTSTART;VALUE=DATE:${toIcsDate(event.date)}`;
  const dtEndLine = startTime
    ? `DTEND${tzParam}:${toIcsFloating(event.date, event.endTime ?? startTime)}`
    : null;

  const description = [
    event.summary,
    sourceUrl ? `Source: ${sourceUrl}` : null,
    startTime
      ? tzid
        ? `Times are in ${tzid}.`
        : "Times shown are local to the event location."
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const cancelled = options.method === "cancel" || event.status === "cancelled";

  const peopleLines =
    options.method === "publish"
      ? []
      : [
          `SEQUENCE:${Math.floor(now.getTime() / 1000)}`,
          `ORGANIZER;CN=${quoteIcsParam(options.organizer.name)}:mailto:${options.organizer.email}`,
          [
            "ATTENDEE",
            options.attendee.name
              ? `CN=${quoteIcsParam(options.attendee.name)}`
              : null,
            "ROLE=REQ-PARTICIPANT",
            options.method === "cancel"
              ? "PARTSTAT=DECLINED"
              : "PARTSTAT=ACCEPTED",
            `RSVP=FALSE:mailto:${options.attendee.email}`,
          ]
            .filter(Boolean)
            .join(";"),
        ];

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AIT Community//Events//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${ICS_METHOD[options.method]}`,
    "BEGIN:VEVENT",
    `UID:${eventIcsUid(event)}`,
    `DTSTAMP:${toIcsUtcStamp(now)}`,
    dtStartLine,
    ...(dtEndLine ? [dtEndLine] : []),
    `SUMMARY:${escapeIcsText(event.title)}`,
    description ? `DESCRIPTION:${escapeIcsText(description)}` : "",
    `LOCATION:${escapeIcsText(event.location)}`,
    `URL:${sourceUrl ?? eventUrl}`,
    ...peopleLines,
    cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter((line) => line.length > 0)
    .map(foldLine)
    .join("\r\n");
}
