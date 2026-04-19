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
