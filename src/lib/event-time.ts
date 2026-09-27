/**
 * Pure helpers for event time handling.
 *
 * Events store their schedule as three loosely-coupled fields: `date` (an ISO
 * timestamp whose calendar date is authoritative), `startTime`/`endTime`
 * ("HH:MM" wall-clock strings), and — since #166 — `timezone` (an IANA name
 * such as "Europe/Amsterdam"). Times stay wall-clock in the event's zone; we
 * deliberately do NOT convert stored times to UTC instants. These helpers turn
 * that triple into real instants and timezone-qualified display strings.
 *
 * Zero dependencies: everything is built on Intl. Converting a
 * wall-clock-in-zone to a UTC instant has no direct Intl API, so
 * `eventWallTimeToUtc` uses an offset-inversion with a second pass to settle
 * DST boundaries (see tests for CET/CEST cases).
 */

/**
 * Platform-wide fallback timezone. AIT Community's home market is Amsterdam
 * (Dutch locale, community events historically in NL), so existing events are
 * backfilled to this zone and new events default to it when no better signal
 * (organizer browser, Luma feed) is available. Organizers can always override.
 */
export const DEFAULT_EVENT_TIMEZONE = "Europe/Amsterdam";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

let supportedZones: Set<string> | null = null;

function getSupportedZones(): Set<string> {
  if (!supportedZones) {
    try {
      supportedZones = new Set(Intl.supportedValuesOf("timeZone"));
      supportedZones.add("UTC");
    } catch {
      supportedZones = new Set();
    }
  }
  return supportedZones;
}

/**
 * Whether `tz` is a usable IANA timezone. Checks
 * `Intl.supportedValuesOf("timeZone")` first and falls back to constructing a
 * DateTimeFormat so legacy aliases (e.g. "Asia/Calcutta") coming from external
 * feeds still pass.
 */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.trim() === "") return false;
  if (getSupportedZones().has(tz)) return true;
  // Reject bare abbreviations/offsets that DateTimeFormat may tolerate but
  // that are not IANA zone names; IANA names (incl. aliases) contain "/" or
  // are well-known fixed zones like "UTC".
  if (!tz.includes("/") && tz !== "UTC") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Extract the calendar date parts from a Payload date value (full ISO or YYYY-MM-DD). */
function getDateParts(date: string): { y: number; m: number; d: number } {
  const datePart = date.split("T")[0] ?? "";
  const [y = NaN, m = NaN, d = NaN] = datePart.split("-").map(Number);
  return { y, m, d };
}

/**
 * Whether `date` carries numeric Y-M-D parts. Malformed/corrupt rows (e.g. a
 * mangled `date` column) must degrade to raw-string rendering in the display
 * helpers below rather than throw "Invalid time value" — the reminder cron
 * formats events in a loop and one bad row must not abort the whole run.
 */
function hasValidDateParts(date: string): boolean {
  const { y, m, d } = getDateParts(date);
  return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d);
}

function getTimeParts(time: string): { hh: number; mm: number } {
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  return { hh: Number.isFinite(hh) ? hh : 0, mm: Number.isFinite(mm) ? mm : 0 };
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function getZoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = getPartsFormatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? NaN);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return asUtc - instant.getTime();
}

/**
 * Convert an event's wall-clock time ("HH:MM" on the calendar date of `date`,
 * in IANA zone `timezone`) to the actual UTC instant.
 *
 * Two-pass offset inversion: guess the instant assuming UTC, read the zone's
 * offset at that guess, re-read at the corrected instant. The second pass
 * settles dates around DST transitions; nonexistent local times (inside the
 * spring-forward gap) resolve to the post-transition offset.
 */
export function eventWallTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): Date {
  const { y, m, d } = getDateParts(date);
  const { hh, mm } = getTimeParts(time);
  const wallAsUtc = Date.UTC(y, m - 1, d, hh, mm);
  const firstOffset = getZoneOffsetMs(timezone, new Date(wallAsUtc));
  const firstGuess = wallAsUtc - firstOffset;
  const secondOffset = getZoneOffsetMs(timezone, new Date(firstGuess));
  return new Date(wallAsUtc - secondOffset);
}

/**
 * CLDR only exposes the familiar abbreviation (CEST, EDT, …) for zones a
 * locale "knows"; everything else renders as a GMT offset. Probe a few
 * locales and prefer an alphabetic abbreviation over "GMT+2".
 */
const ABBREVIATION_LOCALES = ["en-US", "en-GB", "nl-NL"];

// Keyed by `locale|zone`, mirroring getPartsFormatter: Intl.DateTimeFormat
// construction is expensive and getTimeZoneAbbreviation may probe up to three
// locales per call.
const abbreviationFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getAbbreviationFormatter(
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}`;
  let cached = abbreviationFormatterCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
    abbreviationFormatterCache.set(key, cached);
  }
  return cached;
}

/**
 * Short timezone label at a given instant, e.g. "CET" / "CEST" / "GMT+9".
 * Falls back to the IANA name when the zone cannot be formatted.
 */
export function getTimeZoneAbbreviation(
  timezone: string,
  instant: Date,
): string {
  let fallback: string | null = null;
  for (const locale of ABBREVIATION_LOCALES) {
    try {
      const parts = getAbbreviationFormatter(locale, timezone).formatToParts(
        instant,
      );
      const value = parts.find((p) => p.type === "timeZoneName")?.value;
      if (!value) continue;
      if (/^[A-Za-z]+$/.test(value) && !/^(GMT|UTC)$/i.test(value)) {
        return value;
      }
      fallback ??= value;
    } catch {
      return timezone;
    }
  }
  return fallback ?? timezone;
}

export interface EventTimeFields {
  /** ISO timestamp or YYYY-MM-DD; only the calendar date is used. */
  date: string;
  startTime: string | null | undefined;
  endTime?: string | null | undefined;
  timezone: string | null | undefined;
}

/**
 * Event-local time range with timezone abbreviation, e.g. "18:00–21:00 CEST".
 * Returns null when the event has no start time; omits the abbreviation when
 * the timezone is missing/invalid (legacy events before backfill ran).
 */
export function formatEventTimeRange({
  date,
  startTime,
  endTime,
  timezone,
}: EventTimeFields): string | null {
  if (!startTime) return null;
  const range = `${startTime}${endTime ? `–${endTime}` : ""}`;
  if (!isValidTimeZone(timezone) || !hasValidDateParts(date)) return range;
  const instant = eventWallTimeToUtc(date, startTime, timezone);
  return `${range} ${getTimeZoneAbbreviation(timezone, instant)}`;
}

/**
 * Calendar date (YYYY-MM-DD) of a UTC instant as observed in `timezone`.
 * Used by the Luma import: Luma hands us an absolute `start_at` instant plus
 * the event's zone, and the stored `date` must be the event-local calendar
 * date (a Tokyo 02:00 event is "the 15th" locally even when start_at is still
 * the 14th in UTC). Falls back to the raw string's date part when the instant
 * is unparseable or the zone unusable.
 */
export function instantToZonedDateString(
  isoInstant: string,
  timezone: string | null | undefined,
): string {
  const instant = new Date(isoInstant);
  if (Number.isNaN(instant.getTime())) return isoInstant.split("T")[0] ?? "";
  const zone = isValidTimeZone(timezone) ? timezone : "UTC";
  const parts = getPartsFormatter(zone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Wall-clock rendering of a UTC instant in an arbitrary zone (viewer-local conversion). */
export function formatInstantInZone(
  instant: Date,
  timezone: string,
): { date: string; time: string; abbreviation: string } {
  const parts = getPartsFormatter(timezone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
    abbreviation: getTimeZoneAbbreviation(timezone, instant),
  };
}

const WHEN_DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Human-readable, timezone-qualified schedule line for emails and reminders,
 * e.g. "15 Jul 2026, 18:00–21:00 CEST (Europe/Amsterdam)".
 */
export function formatEventWhenText({
  date,
  startTime,
  endTime,
  timezone,
}: EventTimeFields): string {
  const validDate = hasValidDateParts(date);
  let dayLabel: string;
  if (validDate) {
    const { y, m, d } = getDateParts(date);
    dayLabel = WHEN_DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d)));
  } else {
    // Corrupt `date` row: render the raw string rather than throw mid-cron.
    dayLabel = date.split("T")[0] ?? date;
  }
  if (!startTime) return dayLabel;
  if (!validDate || !isValidTimeZone(timezone)) {
    return `${dayLabel}, ${startTime}${endTime ? `–${endTime}` : ""}`;
  }
  const instant = eventWallTimeToUtc(date, startTime, timezone);
  const abbr = getTimeZoneAbbreviation(timezone, instant);
  return `${dayLabel}, ${startTime}${endTime ? `–${endTime}` : ""} ${abbr} (${timezone})`;
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * Cached formatter for a stored calendar day. Keyed by locale AND options,
 * so two callers asking for different shapes never share a formatter.
 * Always UTC: the stored date is rendered as a UTC midnight, so the viewer's
 * own zone can never shift it a day (a UTC-negative browser would).
 */
export function eventDayFormatter(
  locale: string,
  options: Omit<Intl.DateTimeFormatOptions, "timeZone">,
): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(
    Object.entries(options).sort(([a], [b]) => a.localeCompare(b)),
  )}`;
  let fmt = dayFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
    dayFormatters.set(key, fmt);
  }
  return fmt;
}

/** Localised pieces of an event's calendar day, for layouts that place them apart. */
export interface EventDayParts {
  /** The stored event-local calendar date, YYYY-MM-DD. */
  iso: string;
  year: number;
  day: number;
  /** Short weekday without locale punctuation: "Tue" / "di". */
  weekday: string;
  /** Short month without locale punctuation: "Sep" / "okt". */
  month: string;
}

/**
 * The event's calendar day split into localised parts. Like the other display
 * helpers here, the stored date is the event-local date and is never
 * converted through the viewer's zone. Null for a corrupt `date` row.
 */
export function eventDayParts(
  date: string,
  locale: string,
): EventDayParts | null {
  if (!hasValidDateParts(date)) return null;
  const { y, m, d } = getDateParts(date);
  const fmt = eventDayFormatter(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const parts = fmt.formatToParts(new Date(Date.UTC(y, m - 1, d)));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? "").replace(/\.$/, "");
  return {
    iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
    year: y,
    day: d,
    weekday: get("weekday"),
    month: get("month"),
  };
}

/**
 * Compact, localised day + start time for tight spaces (e.g. the homepage
 * notice board): "Sat 12 Oct · 19:00" / "za 12 okt · 19:00". Built from parts
 * so locales don't inject their own commas. The calendar date is the stored
 * event-local date, like the other display helpers here.
 */
export function formatEventShortWhen(
  { date, startTime }: { date: string; startTime?: string | null },
  locale: string,
): string {
  const parts = eventDayParts(date, locale);
  if (!parts) return date.split("T")[0] ?? date;
  const day = `${parts.weekday} ${parts.day} ${parts.month}`;
  return startTime ? `${day} · ${startTime}` : day;
}

/**
 * ISO-8601 local datetime with UTC offset for structured data (JSON-LD),
 * e.g. "2026-07-15T18:00:00+02:00". Falls back to a floating local datetime
 * when no usable timezone exists.
 */
export function formatEventIsoWithOffset(
  date: string,
  time: string,
  timezone: string | null | undefined,
): string {
  const datePart = date.split("T")[0] ?? date;
  const { hh, mm } = getTimeParts(time);
  const local = `${datePart}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
  if (!isValidTimeZone(timezone) || !hasValidDateParts(date)) return local;
  const instant = eventWallTimeToUtc(date, time, timezone);
  const offsetMin = Math.round(getZoneOffsetMs(timezone, instant) / 60_000);
  if (offsetMin === 0) return `${local}+00:00`;
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${oh}:${om}`;
}

const DAY_MS = 86_400_000;

/**
 * Lower bound for a database query whose rows are then passed through
 * `upcomingEvents`. "Today" is judged in each event's own zone (UTC−12 …
 * UTC+14) and `date` may be stored as local midnight expressed in UTC, so
 * comparing `date >= now` in the query would drop an event that is still
 * happening today. Two days back covers every zone; `upcomingEvents` does
 * the exact filtering.
 */
export function upcomingEventsQueryFloor(now: Date = new Date()): string {
  return new Date(now.getTime() - 2 * DAY_MS).toISOString();
}

/**
 * Upper bound for a database query whose rows are then passed through
 * `pastEvents` — the mirror of `upcomingEventsQueryFloor`. `date` is the
 * event-local calendar day, so an event east of UTC (up to UTC+14) can be
 * over while its stored date is still ahead of `now`; comparing
 * `date < now` would hide it for hours after it ended. Two days ahead
 * covers every zone; `pastEvents` does the exact filtering.
 */
export function pastEventsQueryCeiling(now: Date = new Date()): string {
  return new Date(now.getTime() + 2 * DAY_MS).toISOString();
}

interface UpcomingCandidate {
  id?: string | number | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
}

function zoneOrUtc(timezone: string | null | undefined): string {
  return isValidTimeZone(timezone) ? timezone : "UTC";
}

/**
 * When the event starts, as a real instant: its start time in its own zone,
 * or local midnight for a date-only event. Null for a corrupt date.
 */
export function eventStartInstant(event: UpcomingCandidate): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(event.date)) return null;
  return eventWallTimeToUtc(
    event.date,
    event.startTime?.trim() ? event.startTime : "00:00",
    zoneOrUtc(event.timezone),
  );
}

/**
 * When the event is over, as a real instant — only when we actually know:
 * a start and an end time. An end at or before the start runs past
 * midnight into the next day. Null means "unknown": the event then counts
 * as running until its own calendar day ends where it happens.
 */
export function eventEndInstant(event: UpcomingCandidate): Date | null {
  if (!event.startTime || !event.endTime) return null;
  const start = eventStartInstant(event);
  if (!start) return null;
  const zone = zoneOrUtc(event.timezone);
  const end = eventWallTimeToUtc(event.date, event.endTime, zone);
  if (end.getTime() > start.getTime()) return end;
  const nextDay = new Date(
    Date.UTC(
      Number(event.date.slice(0, 4)),
      Number(event.date.slice(5, 7)) - 1,
      Number(event.date.slice(8, 10)) + 1,
    ),
  )
    .toISOString()
    .slice(0, 10);
  return eventWallTimeToUtc(nextDay, event.endTime, zone);
}

function compareIds(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

/**
 * Events that are not over yet, soonest start first.
 *
 * - An event with a start and end time is over once its end has passed
 *   (a late-night event past midnight stays until it really ends).
 * - Otherwise we do not know how long it runs (there is no duration field
 *   and a hackathon can go all day), so it stays until its own calendar day
 *   ends where it happens. Guessing a duration would hide events that are
 *   still running; keeping one a few hours too long only costs a line.
 *
 * Order is the real start instant (start time in the event's zone), then id,
 * so two events on the same day never come back in database order.
 */
export function upcomingEvents<T extends UpcomingCandidate>(
  events: readonly T[],
  now: Date = new Date(),
): T[] {
  return withStartInstants(events, now, false)
    .sort((a, b) => a.start - b.start || compareIds(a.event.id, b.event.id))
    .map(({ event }) => event);
}

/**
 * Events that are over, most recent start first — the mirror image of
 * `upcomingEvents`, with the same rule for "over" (see there). An event
 * without an end time counts as over only once its own calendar day has
 * ended where it happens, so a running event is never listed as past.
 */
export function pastEvents<T extends UpcomingCandidate>(
  events: readonly T[],
  now: Date = new Date(),
): T[] {
  return withStartInstants(events, now, true)
    .sort((a, b) => b.start - a.start || compareIds(b.event.id, a.event.id))
    .map(({ event }) => event);
}

/** True once the event has ended (see `upcomingEvents` for the rule). */
export function isEventOver(
  event: UpcomingCandidate,
  now: Date = new Date(),
): boolean {
  const end = eventEndInstant(event);
  return end
    ? end.getTime() <= now.getTime()
    : event.date.slice(0, 10) <
        instantToZonedDateString(now.toISOString(), event.timezone);
}

/** Events on the chosen side of "over", paired with their start instant. */
function withStartInstants<T extends UpcomingCandidate>(
  events: readonly T[],
  now: Date,
  over: boolean,
): { event: T; start: number }[] {
  return events.flatMap((event) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date.slice(0, 10))) return [];
    if (isEventOver(event, now) !== over) return [];
    const start = eventStartInstant(event);
    return start ? [{ event, start: start.getTime() }] : [];
  });
}

/**
 * Rows of a date-sorted, limited query that are safe to rank by start
 * instant. If the query came back full, rows past the cut may start before
 * rows near it: ties on the last day are cut arbitrarily, and zones span
 * UTC−12 … UTC+14, so an event two calendar days later can still start
 * earlier in real time. Dropping the last fetched day and the two before it
 * leaves only rows that start before anything the query left out. A short
 * page is complete and kept whole.
 */
export function completeUpcomingCandidates<T extends { date: string }>(
  rows: readonly T[],
  limit: number,
): T[] {
  const last = rows[rows.length - 1];
  if (rows.length < limit || !last) return [...rows];
  const lastDay = last.date.slice(0, 10);
  const cutoff = new Date(`${lastDay}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 2);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  return rows.filter((row) => row.date.slice(0, 10) < cutoffDay);
}
