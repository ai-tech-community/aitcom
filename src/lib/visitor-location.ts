import { headers } from "next/headers";

export interface VisitorLocation {
  countryCode: string;
  countryName: string | null;
  city: string | null;
}

export async function getVisitorLocation(): Promise<VisitorLocation | null> {
  const h = await headers();
  const countryCode =
    h.get("x-vercel-ip-country") ??
    h.get("cf-ipcountry") ??
    process.env.DEFAULT_VISITOR_COUNTRY ??
    null;

  if (!countryCode || countryCode === "XX") return null;

  const city = h.get("x-vercel-ip-city") ?? null;

  let countryName: string | null = null;
  try {
    countryName =
      new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? null;
  } catch {
    countryName = null;
  }

  return { countryCode, countryName, city };
}

/** Where a request comes from, as Vercel's edge estimates it (coarse). */
export type IpOrigin = {
  point: { lat: number; lng: number };
  city: string | null;
};

/**
 * The visitor's approximate position from Vercel's request headers
 * (`x-vercel-ip-latitude` / `-longitude` / `-city`), or null off Vercel or
 * when unknown. City names arrive URI-encoded.
 */
export function ipOriginFromHeaders(h: Headers): IpOrigin | null {
  const lat = Number(h.get("x-vercel-ip-latitude"));
  const lng = Number(h.get("x-vercel-ip-longitude"));
  if (
    !h.get("x-vercel-ip-latitude") ||
    !h.get("x-vercel-ip-longitude") ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }
  let city: string | null = null;
  const raw = h.get("x-vercel-ip-city");
  if (raw) {
    try {
      city = decodeURIComponent(raw);
    } catch {
      city = raw;
    }
  }
  return { point: { lat, lng }, city };
}
