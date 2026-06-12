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
      const parts = new Intl.DateTimeFormat(locale, {
        timeZone: timezone,
        timeZoneName: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(instant);
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
  if (!isValidTimeZone(timezone)) return range;
  const instant = eventWallTimeToUtc(date, startTime, timezone);
  return `${range} ${getTimeZoneAbbreviation(timezone, instant)}`;
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
  const { y, m, d } = getDateParts(date);
  const dayLabel = WHEN_DATE_FORMAT.format(new Date(Date.UTC(y, m - 1, d)));
  if (!startTime) return dayLabel;
  if (!isValidTimeZone(timezone)) {
    return `${dayLabel}, ${startTime}${endTime ? `–${endTime}` : ""}`;
  }
  const instant = eventWallTimeToUtc(date, startTime, timezone);
  const abbr = getTimeZoneAbbreviation(timezone, instant);
  return `${dayLabel}, ${startTime}${endTime ? `–${endTime}` : ""} ${abbr} (${timezone})`;
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
  if (!isValidTimeZone(timezone)) return local;
  const instant = eventWallTimeToUtc(date, time, timezone);
  const offsetMin = Math.round(getZoneOffsetMs(timezone, instant) / 60_000);
  if (offsetMin === 0) return `${local}+00:00`;
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const oh = String(Math.floor(abs / 60)).padStart(2, "0");
  const om = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${oh}:${om}`;
}
