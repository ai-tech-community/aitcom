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

function extractTime(isoString: string): string {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function normalizeLumaEvent(
  event: LumaEvent,
  communityId: string,
): NormalizedEvent {
  const location =
    event.geo_address_json?.address ?? (event.meeting_url ? "Online" : "TBA");

  return {
    id: `luma-${event.api_id}`,
    title: event.name,
    slug: null,
    description: event.description_md,
    type: "meetup",
    date: event.start_at,
    startTime: extractTime(event.start_at),
    endTime: event.end_at ? extractTime(event.end_at) : null,
    location,
    maxAttendees: event.max_capacity,
    image: event.cover_url,
    status: "published",
    communityId,
    source: "luma",
    lumaUrl: `https://lu.ma/${event.url}`,
  };
}
