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
  maxAttendees: number | null;
  image: string | null;
  status: string;
  communityId: string;
  source: "native" | "luma";
  lumaUrl: string | null;
  coverImageId?: number | null;
  coverImageUrl?: string | null;
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
    date: event.start_at,
    startTime: extractTime(event.start_at, timezone),
    endTime: event.end_at ? extractTime(event.end_at, timezone) : null,
    timezone,
    location,
    maxAttendees: event.max_capacity,
    image: event.cover_url,
    status: "published",
    communityId,
    source: "luma",
    lumaUrl: `https://lu.ma/${event.url}`,
  };
}
