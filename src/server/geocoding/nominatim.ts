const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;

const CONTINENTS = new Set([
  "europe",
  "north america",
  "south america",
  "asia",
  "africa",
  "oceania",
  "antarctica",
]);

let lastRequestAt = 0;

async function throttle() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  displayName: string;
}

/** A settlement match, for callers that need its country, not its point. */
export interface PlaceCandidate {
  /** ISO 3166-1 alpha-2, upper case. Null when Nominatim gives none. */
  countryCode: string | null;
  /** Local name ("Den Haag"). */
  name: string | null;
  /** English name ("The Hague"), when OSM has one. */
  nameEn: string | null;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
  address?: { country_code?: string };
  namedetails?: Record<string, string>;
}

async function search(
  query: string,
  params: Record<string, string>,
): Promise<NominatimResponse[] | null> {
  await throttle();

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const userAgent =
    process.env.NOMINATIM_USER_AGENT ??
    "aitcommunity-events/1.0 (https://aitcommunity.org)";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept-Language": "en",
      },
    });
    if (!res.ok) {
      console.error("[geocode] nominatim error", res.status, await res.text());
      return null;
    }
    return (await res.json()) as NominatimResponse[];
  } catch (error) {
    console.error("[geocode] request failed", error);
    return null;
  }
}

async function requestOnce(query: string): Promise<GeocodeResult | null> {
  const data = await search(query, { limit: "1" });
  const first = data?.[0];
  if (!first) return null;
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return {
    latitude: lat,
    longitude: lon,
    displayName: first.display_name,
  };
}

/**
 * Top settlement matches (city, town, village, state, country…), best
 * first. Streets, stations, and businesses are never returned.
 */
export async function searchPlaces(query: string): Promise<PlaceCandidate[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const data = await search(trimmed, {
    limit: "5",
    featureType: "settlement",
    addressdetails: "1",
    namedetails: "1",
  });
  return (data ?? []).map((row) => ({
    countryCode: row.address?.country_code?.toUpperCase() ?? null,
    name: row.namedetails?.name ?? null,
    nameEn: row.namedetails?.["name:en"] ?? null,
  }));
}

export async function geocodeLocation(
  query: string,
): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return requestOnce(trimmed);
}

export async function geocodeEvent(event: {
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): Promise<GeocodeResult | null> {
  const queries = buildGeocodeQueries(event);
  for (const q of queries) {
    const result = await requestOnce(q);
    if (result) return result;
  }
  return null;
}

function cleanPart(v?: string | null): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\s*[+/]\s*virtual.*$/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .trim();
}

export function buildGeocodeQueries(event: {
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string[] {
  const location = cleanPart(event.location);
  const city = cleanPart(event.city);
  const country = cleanPart(event.country);
  const region = cleanPart(event.region);
  const usableRegion =
    region && !CONTINENTS.has(region.toLowerCase()) ? region : "";

  const candidates: string[] = [];
  if (city && country) candidates.push(`${city}, ${country}`);
  if (
    location &&
    country &&
    !location.toLowerCase().includes(country.toLowerCase())
  ) {
    candidates.push(`${location}, ${country}`);
  }
  if (location) candidates.push(location);
  if (city && usableRegion) candidates.push(`${city}, ${usableRegion}`);
  if (city) candidates.push(city);

  const seen = new Set<string>();
  return candidates.filter((q) => {
    const key = q.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return q.length > 0;
  });
}

export function buildGeocodeQuery(event: {
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  return buildGeocodeQueries(event)[0] ?? "";
}
