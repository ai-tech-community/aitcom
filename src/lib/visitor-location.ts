import { headers } from "next/headers";
import { readVisitorHeaders } from "./visitor-headers";

export interface VisitorLocation {
  countryCode: string;
  countryName: string | null;
  city: string | null;
}

export async function getVisitorLocation(): Promise<VisitorLocation | null> {
  const visitor = readVisitorHeaders(await headers());
  const countryCode =
    visitor.countryCode ?? process.env.DEFAULT_VISITOR_COUNTRY ?? null;

  if (!countryCode || countryCode === "XX") return null;

  const city = visitor.city;

  let countryName: string | null = null;
  try {
    countryName =
      new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode) ?? null;
  } catch {
    countryName = null;
  }

  return { countryCode, countryName, city };
}

