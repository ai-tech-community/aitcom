const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1100;

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

export async function geocodeLocation(
  query: string,
): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  await throttle();

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", trimmed);
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

export function buildGeocodeQuery(event: {
  location?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
}): string {
  const parts = [event.location, event.city, event.region, event.country]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 0);
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }
  return deduped.join(", ");
}
