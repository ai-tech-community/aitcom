export interface MapEventPin {
  id: number;
  slug: string;
  title: string;
  date: string;
  endDate?: string | null;
  location: string;
  latitude: number;
  longitude: number;
  type: string;
  aitFitScore?: number | null;
}

export interface MappableEvent {
  id: number;
  slug: string;
  title: string;
  date: string;
  endDate?: string | null;
  location: string;
  latitude?: unknown;
  longitude?: unknown;
  type: string;
  aitFitScore?: number | null;
}

/**
 * A coordinate from Payload. Postgres `numeric` sometimes arrives as a
 * string; both forms are a real point. Null, blank, and non-finite values
 * are not.
 */
export function eventCoordinate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** An in-person or hybrid event with a place name the map can pin. */
export function eventHasMappableVenue(event: {
  format?: string | null;
  location?: string | null;
}): boolean {
  if (event.format === "online") return false;
  const location = event.location?.trim() ?? "";
  if (!location) return false;
  if (/^(online|tba|tbd)$/i.test(location)) return false;
  if (/^online\b/i.test(location)) return false;
  return true;
}

/**
 * Pins for the events map. Every event with a finite latitude and longitude
 * is included. Missing coordinates are omitted — the map has no other cap.
 */
export function toMapEvents(events: readonly MappableEvent[]): MapEventPin[] {
  const pins: MapEventPin[] = [];
  for (const event of events) {
    const latitude = eventCoordinate(event.latitude);
    const longitude = eventCoordinate(event.longitude);
    if (latitude == null || longitude == null) continue;
    pins.push({
      id: event.id,
      slug: event.slug,
      title: event.title,
      date: event.date,
      endDate: event.endDate ?? null,
      location: event.location,
      latitude,
      longitude,
      type: event.type,
      aitFitScore: event.aitFitScore ?? null,
    });
  }
  return pins;
}
