import {
  eventDayParts,
  formatEventDay,
  type EventTimeFields,
} from "@/lib/event-time";
import {
  eventRowKind,
  type EventRowLabels,
} from "@/components/events/rows/event-rows";

/** The event page's date pieces: the hero's date block and the side card. */
export interface EventDetailDay {
  /** YYYY-MM-DD for `<time dateTime>`, or null for a corrupt date. */
  dateTime: string | null;
  /** Short month as the locale writes it, "Oct" / "okt" (CSS upper-cases it). */
  month: string;
  /** Zero-padded day of month, "05". */
  day: string;
  year: string;
  /** The whole day as one label, "05 Oct 2026" / "05 okt 2026". */
  label: string;
}

/**
 * The event's own calendar day, split for the event page. Like every event
 * surface, it reads the stored event-local date and never moves it through
 * the server's or the viewer's zone.
 */
export function eventDetailDay(
  event: Pick<EventTimeFields, "date">,
  locale: string,
): EventDetailDay {
  const parts = eventDayParts(event.date, locale);
  return {
    dateTime: parts?.iso ?? null,
    month: parts?.month ?? "",
    day: parts ? String(parts.day).padStart(2, "0") : "--",
    year: parts ? String(parts.year) : "",
    label: formatEventDay(event.date, locale),
  };
}

/**
 * One line naming the event for link previews and the meta description:
 * "Deep Dive · 05 Oct 2026 · Amsterdam". Words and date follow the page's
 * language; the dots keep it free of English glue words.
 */
export function eventSummaryLine(
  event: { type: string; date: string; location: string },
  locale: string,
  labels: Pick<EventRowLabels, "types">,
): string {
  return [
    eventRowKind(event.type, labels).label,
    formatEventDay(event.date, locale),
    event.location.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}
