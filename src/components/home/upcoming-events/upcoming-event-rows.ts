import { eventDayParts, formatEventTimeRange } from "@/lib/event-time";
import { EVENT_TYPES, type EventType } from "@/lib/event-metadata";
import {
  isOnlineEvent,
  publicEventPlace,
  sourcedListingEventPlace,
} from "@/lib/events/public-events";

/**
 * Plain, already-loaded event data the homepage hands to the section. The
 * server page shapes Payload docs into this; nothing here touches a client.
 */
export interface UpcomingEventInput {
  id: string | number;
  slug: string;
  title: string;
  type: string;
  format?: string | null;
  /** ISO timestamp or YYYY-MM-DD; the calendar date is the event-local day. */
  date: string;
  /** "HH:MM" wall-clock in `timezone`. */
  startTime?: string | null;
  /** IANA zone the start time is expressed in. */
  timezone?: string | null;
  city?: string | null;
  country?: string | null;
  location?: string | null;
  /** Name of the community hosting the event, when it has one. */
  host?: string | null;
}

/** Translated words the presenter needs; the component supplies them. */
export interface UpcomingEventLabels {
  types: Record<EventType, string>;
  online: string;
  hybrid: string;
  inPerson: string;
  hostedBy: (name: string) => string;
}

export interface UpcomingEventKind {
  /** Known event type, or null for a legacy value outside EVENT_TYPES. */
  type: EventType | null;
  label: string;
}

/** One timetable row, ready to render. */
export interface UpcomingEventRow {
  key: string;
  href: `/events/${string}`;
  title: string;
  /** YYYY-MM-DD for `<time dateTime>`, or null for a corrupt date. */
  dateTime: string | null;
  /** Zero-padded day of month, "05". */
  day: string;
  /** Short month as the locale writes it, "Sep" / "okt" (CSS upper-cases it). */
  month: string;
  /** Short weekday as the locale writes it, "Tue" / "di". */
  weekday: string;
  /** Year, only when it differs from the current one. */
  year: string | null;
  /** Start time with zone abbreviation, "09:00 PDT"; null without startTime. */
  time: string | null;
  /** ["City, Country"] / ["Online"] / ["Amsterdam, Netherlands", "Hybrid"]. */
  placeParts: string[];
  /** "by <community>", when a host community is known. */
  host: string | null;
  kind: UpcomingEventKind;
  /** The soonest event: the only row the section marks. */
  isNext: boolean;
}

/** "Amsterdam, Netherlands" already names "netherlands"; so does "Singapore". */
function endsWithPlace(city: string, country: string): boolean {
  const c = city.toLocaleLowerCase();
  const n = country.toLocaleLowerCase();
  return c === n || c.endsWith(`, ${n}`);
}

function isEventType(value: string): value is EventType {
  return (EVENT_TYPES as readonly string[]).includes(value);
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed;
}

/**
 * Where the event happens, in the words a visitor needs: the city (with its
 * country), "Online", or the city plus "Hybrid". The format rides on the
 * place line so it is never said twice. Returned as parts so the screen
 * shows "Amsterdam, Netherlands · Hybrid" and a reader hears commas.
 */
export function upcomingEventPlaceParts(
  event: Pick<UpcomingEventInput, "format" | "city" | "country" | "location">,
  labels: Pick<UpcomingEventLabels, "online" | "hybrid" | "inPerson">,
): string[] {
  // Hybrid is never "online only", whatever a legacy location says.
  const online = event.format !== "hybrid" && isOnlineEvent(event);
  const venue = sourcedListingEventPlace(event);
  const city = clean(event.city);
  const country = clean(event.country);
  const withCountry =
    venue && venue === city && country && !endsWithPlace(city, country)
      ? `${city}, ${country}`
      : venue;
  const place = publicEventPlace({ online, city: withCountry }, labels.online);
  if (event.format === "hybrid") {
    return place ? [place, labels.hybrid] : [labels.hybrid];
  }
  if (place) return [place];
  return event.format === "in-person" ? [labels.inPerson] : [];
}

export function upcomingEventKind(
  type: string,
  labels: Pick<UpcomingEventLabels, "types">,
): UpcomingEventKind {
  return isEventType(type)
    ? { type, label: labels.types[type] }
    : { type: null, label: type.replace(/_/g, " ") };
}

/**
 * Event → timetable row. Dates come from the stored event-local calendar
 * day and the time is qualified with the event's own zone, so every viewer
 * sees when it happens where it happens. The first row is the next event.
 */
export function presentUpcomingEvents(
  events: readonly UpcomingEventInput[],
  {
    locale,
    labels,
    now = new Date(),
  }: { locale: string; labels: UpcomingEventLabels; now?: Date },
): UpcomingEventRow[] {
  return events.map((event, index) => {
    const parts = eventDayParts(event.date, locale);
    const time = formatEventTimeRange({
      date: event.date,
      startTime: clean(event.startTime),
      endTime: null,
      timezone: event.timezone,
    });
    const placeParts = upcomingEventPlaceParts(event, labels);
    const hostName = clean(event.host);
    const host = hostName ? labels.hostedBy(hostName) : null;
    const kind = upcomingEventKind(event.type, labels);

    return {
      key: String(event.id),
      href: `/events/${event.slug}`,
      title: event.title.trim(),
      dateTime: parts?.iso ?? null,
      day: parts ? String(parts.day).padStart(2, "0") : "--",
      month: parts?.month ?? "",
      weekday: parts?.weekday ?? "",
      year:
        parts && parts.year !== now.getUTCFullYear()
          ? String(parts.year)
          : null,
      time,
      placeParts,
      host,
      kind,
      isNext: index === 0,
    };
  });
}
