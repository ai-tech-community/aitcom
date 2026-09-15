/**
 * City / region centroids for approximate Startups map pins.
 * Place data only — never company rows, never street addresses.
 */
export type StartupPlaceKind = "city" | "region";

export type StartupPlaceCentroid = {
  lat: number;
  lng: number;
  kind: StartupPlaceKind;
};

const STREET_WORD =
  /\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|suite|ste\.?|floor|fl\.?)\b/i;

export function normalizeStartupPlaceKey(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .replace(/,\s*/g, ", ");
}

export function isStreetLikeStartupPlace(
  value: string | null | undefined,
): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  return /\d/.test(trimmed) && STREET_WORD.test(trimmed);
}

/** Canonical city/region centroids. Keys are normalizeStartupPlaceKey aliases. */
const PLACE_CENTROIDS: Record<string, StartupPlaceCentroid> = {
  "toronto, canada": { lat: 43.6532, lng: -79.3832, kind: "city" },
  toronto: { lat: 43.6532, lng: -79.3832, kind: "city" },
  "toronto, on": { lat: 43.6532, lng: -79.3832, kind: "city" },
  "new york, us": { lat: 40.7128, lng: -74.006, kind: "city" },
  "new york, usa": { lat: 40.7128, lng: -74.006, kind: "city" },
  "new york, united states": { lat: 40.7128, lng: -74.006, kind: "city" },
  "new york": { lat: 40.7128, lng: -74.006, kind: "city" },
  nyc: { lat: 40.7128, lng: -74.006, kind: "city" },
  "san francisco, us": { lat: 37.7749, lng: -122.4194, kind: "city" },
  "san francisco": { lat: 37.7749, lng: -122.4194, kind: "city" },
  "palo alto, us": { lat: 37.4419, lng: -122.143, kind: "city" },
  "palo alto": { lat: 37.4419, lng: -122.143, kind: "city" },
  "london, uk": { lat: 51.5074, lng: -0.1278, kind: "city" },
  london: { lat: 51.5074, lng: -0.1278, kind: "city" },
  "paris, france": { lat: 48.8566, lng: 2.3522, kind: "city" },
  paris: { lat: 48.8566, lng: 2.3522, kind: "city" },
  "amsterdam, netherlands": { lat: 52.3676, lng: 4.9041, kind: "city" },
  amsterdam: { lat: 52.3676, lng: 4.9041, kind: "city" },
  "berlin, germany": { lat: 52.52, lng: 13.405, kind: "city" },
  berlin: { lat: 52.52, lng: 13.405, kind: "city" },
  singapore: { lat: 1.3521, lng: 103.8198, kind: "city" },
  "austin, us": { lat: 30.2672, lng: -97.7431, kind: "city" },
  austin: { lat: 30.2672, lng: -97.7431, kind: "city" },
  "seattle, us": { lat: 47.6062, lng: -122.3321, kind: "city" },
  seattle: { lat: 47.6062, lng: -122.3321, kind: "city" },
  "boston, us": { lat: 42.3601, lng: -71.0589, kind: "city" },
  boston: { lat: 42.3601, lng: -71.0589, kind: "city" },
  "los angeles, us": { lat: 34.0522, lng: -118.2437, kind: "city" },
  "los angeles": { lat: 34.0522, lng: -118.2437, kind: "city" },
  "california, us": { lat: 36.7783, lng: -119.4179, kind: "region" },
  california: { lat: 36.7783, lng: -119.4179, kind: "region" },
  netherlands: { lat: 52.1326, lng: 5.2913, kind: "region" },
  "the netherlands": { lat: 52.1326, lng: 5.2913, kind: "region" },
};

export function startupPlaceCentroid(
  value: string | null | undefined,
): StartupPlaceCentroid | null {
  if (isStreetLikeStartupPlace(value)) return null;
  const key = normalizeStartupPlaceKey(value);
  if (!key) return null;
  return PLACE_CENTROIDS[key] ?? null;
}

export function sourcedStartupPlaceLabel(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (isStreetLikeStartupPlace(trimmed)) return null;
  return trimmed;
}
