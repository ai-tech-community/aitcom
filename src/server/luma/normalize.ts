import { instantToZonedDateString } from "@/lib/event-time";

import type { LumaEvent } from "./client";

export interface NormalizedEvent {
  id: string | number;
  title: string;
  slug: string | null;
  description: string | null;
  type: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** IANA timezone the start/end times are expressed in. */
  timezone: string | null;
  location: string;
  /**
   * Attendance format, derived from the source's structured
   * physical/online signal. Optional so native-event mappings (which have no
   * such raw signal) need not set it — only the Luma path populates it. The
   * "location" string alone can't recover this: Luma collapses both a
   * physical address and an online meeting link into the same field, so the
   * raw event's geo/meeting-url pair is the only reliable source.
   */
  format?: "online" | "in-person" | "hybrid";
  maxAttendees: number | null;
  image: string | null;
  status: string;
  communityId: string;
  source: "native" | "luma";
  lumaUrl: string | null;
  coverImageId?: number | null;
  coverImageUrl?: string | null;
}

/**
 * Derive attendance format from the raw Luma event's structured signal.
 * Both physical + online → "hybrid"; physical only → "in-person"; online
 * only → "online". Neither (a "TBA"-style event) defaults to "online": an
 * in-person event with no geocodable address is inert in the conflict
 * catchment anyway (normalize sets no coordinates), whereas "online" keeps
 * it corpus-useful — the conservative, competition-widest default.
 */
function deriveLumaFormat(event: LumaEvent): "online" | "in-person" | "hybrid" {
  const hasPhysical = Boolean(event.geo_address_json?.address);
  const hasOnline = Boolean(event.meeting_url);
  if (hasPhysical && hasOnline) return "hybrid";
  if (hasPhysical) return "in-person";
  return "online";
}

// Luma gives absolute instants plus the event's IANA timezone; render the
// wall-clock time in that zone (not the server's local zone).
function extractTime(isoString: string, timeZone: string | null): string {
  const d = new Date(isoString);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hourCycle: "h23",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timeZone ?? undefined,
    }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

export function normalizeLumaEvent(
  event: LumaEvent,
  communityId: string,
): NormalizedEvent {
  const location =
    event.geo_address_json?.address ?? (event.meeting_url ? "Online" : "TBA");
  const timezone = event.timezone || null;

  return {
    id: `luma-${event.api_id}`,
    title: event.name,
    slug: null,
    description: event.description_md,
    type: "meetup",
    // start_at is an absolute UTC instant; the stored `date` must be the
    // event-local calendar date (east/west of UTC it can differ by a day).
    date: instantToZonedDateString(event.start_at, timezone),
    startTime: extractTime(event.start_at, timezone),
    endTime: event.end_at ? extractTime(event.end_at, timezone) : null,
    timezone,
    location,
    format: deriveLumaFormat(event),
    maxAttendees: event.max_capacity,
    image: event.cover_url,
    status: "published",
    communityId,
    source: "luma",
    lumaUrl: `https://lu.ma/${event.url}`,
  };
}
