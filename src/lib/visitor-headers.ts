/**
 * Where a request comes from, as Vercel's edge estimates it, read from its
 * `x-vercel-ip-*` headers (Cloudflare's country header as a fallback).
 * Pure: takes the headers, no Next.js runtime, so every reader — the
 * events page's country default and the Explore page's "near you" — parses
 * them the same way (city names arrive URI-encoded).
 */

export type VisitorHeaders = {
  countryCode: string | null;
  city: string | null;
  point: { lat: number; lng: number } | null;
};

function decoded(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function readVisitorHeaders(h: Headers): VisitorHeaders {
  const country = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry");
  const rawLat = h.get("x-vercel-ip-latitude");
  const rawLng = h.get("x-vercel-ip-longitude");
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  const point =
    rawLat &&
    rawLng &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  return {
    countryCode: country && country !== "XX" ? country : null,
    city: decoded(h.get("x-vercel-ip-city")),
    point,
  };
}

/** A position to measure "near" from, or null when the edge has none. */
export type IpOrigin = {
  point: { lat: number; lng: number };
  city: string | null;
};

export function ipOriginFromHeaders(h: Headers): IpOrigin | null {
  const { point, city } = readVisitorHeaders(h);
  return point ? { point, city } : null;
}
