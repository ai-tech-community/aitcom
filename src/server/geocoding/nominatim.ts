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

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

async function requestOnce(query: string): Promise<GeocodeResult | null> {
  await throttle();

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

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
    const data = (await res.json()) as NominatimResponse[];
    const first = data[0];
    if (!first) return null;
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      latitude: lat,
      longitude: lon,
      displayName: first.display_name,
    };
  } catch (error) {
    console.error("[geocode] request failed", error);
    return null;
  }
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
