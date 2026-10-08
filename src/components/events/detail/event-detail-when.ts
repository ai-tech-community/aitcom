import {
  eventDayParts,
  formatEventDayRange,
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
  /** YYYY-MM-DD of the last day, when it is a later day than the start. */
  endDateTime: string | null;
  /** Short month as the locale writes it, "Oct" / "okt" (CSS upper-cases it). */
  month: string;
  /** Zero-padded day of month, "05". */
  day: string;
  year: string;
  /** One day, or the span when `endDate` is a later day: "20–21 Oct 2026". */
  label: string;
}

/**
 * The event's own calendar day, split for the event page. Like every event
 * surface, it reads the stored event-local date and never moves it through
 * the server's or the viewer's zone.
 */
export function eventDetailDay(
  event: Pick<EventTimeFields, "date" | "endDate">,
  locale: string,
): EventDetailDay {
  const parts = eventDayParts(event.date, locale);
  const endParts = event.endDate ? eventDayParts(event.endDate, locale) : null;
  const ranged = Boolean(parts && endParts && parts.iso !== endParts.iso);
  return {
    dateTime: parts?.iso ?? null,
    endDateTime: ranged && endParts ? endParts.iso : null,
    month: parts?.month ?? "",
    day: parts ? String(parts.day).padStart(2, "0") : "--",
    year: parts ? String(parts.year) : "",
    label: formatEventDayRange(event.date, event.endDate, locale),
  };
}

/**
 * One line naming the event for link previews and the meta description:
 * "Deep Dive · 05 Oct 2026 · Amsterdam". Words and date follow the page's
 * language; the dots keep it free of English glue words.
 */
export function eventSummaryLine(
  event: {
    type: string;
    date: string;
    endDate?: string | null;
    location: string;
  },
  locale: string,
  labels: Pick<EventRowLabels, "types">,
): string {
  return [
    eventRowKind(event.type, labels).label,
    formatEventDayRange(event.date, event.endDate, locale),
    event.location.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
}
