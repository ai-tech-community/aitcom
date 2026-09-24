/**
 * Country of a sourced place string.
 *
 * Sourced regions are free text ("San Francisco, CA, USA; Remote",
 * "Wamego, Kansas, United States", "Berlin"). A place is a country only when
 * it names one of the assigned ISO 3166-1 codes below — through the last
 * comma part of the first ";" place, or through a known city in the shared
 * place list. Anything else is `unknown` (the geocoder may still place it at
 * write time) or `none` (remote, multi-region). Nothing outside the closed
 * code list is ever shown as a country.
 */
import {
  normalizeStartupPlaceKey,
  startupPlaceCentroid,
} from "./startups-places";
import type { StartupLocale } from "./startups";

/** Assigned ISO 3166-1 alpha-2 codes, plus XK (Kosovo). */
// prettier-ignore
export const STARTUP_COUNTRY_CODES = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT",
  "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI",
  "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY",
  "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN",
  "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
  "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK",
  "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
  "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM",
  "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR",
  "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
  "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS",
  "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK",
  "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW",
  "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP",
  "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
  "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM",
  "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF",
  "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW",
  "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
  "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
] as const;

export type StartupCountryCode = (typeof STARTUP_COUNTRY_CODES)[number];

const CODE_SET: ReadonlySet<string> = new Set(STARTUP_COUNTRY_CODES);

export function isStartupCountryCode(
  value: string | null | undefined,
): value is StartupCountryCode {
  return typeof value === "string" && CODE_SET.has(value);
}

/** Spellings the ICU names below do not cover. Keys are place keys. */
const COUNTRY_ALIASES: Record<string, StartupCountryCode> = {
  usa: "US",
  "united states of america": "US",
  "great britain": "GB",
  britain: "GB",
  england: "GB",
  scotland: "GB",
  wales: "GB",
  "northern ireland": "GB",
  uae: "AE",
  korea: "KR",
  "republic of korea": "KR",
  "the netherlands": "NL",
  holland: "NL",
  turkey: "TR",
  "czech republic": "CZ",
  "ivory coast": "CI",
  burma: "MM",
  swaziland: "SZ",
  macau: "MO",
  luxemburg: "LU",
};

const US_STATES = [
  ["al", "alabama"],
  ["ak", "alaska"],
  ["az", "arizona"],
  ["ar", "arkansas"],
  ["ca", "california"],
  ["co", "colorado"],
  ["ct", "connecticut"],
  ["de", "delaware"],
  ["dc", "district of columbia"],
  ["fl", "florida"],
  ["hi", "hawaii"],
  ["id", "idaho"],
  ["il", "illinois"],
  ["in", "indiana"],
  ["ia", "iowa"],
  ["ks", "kansas"],
  ["ky", "kentucky"],
  ["la", "louisiana"],
  ["me", "maine"],
  ["md", "maryland"],
  ["ma", "massachusetts"],
  ["mi", "michigan"],
  ["mn", "minnesota"],
  ["ms", "mississippi"],
  ["mo", "missouri"],
  ["mt", "montana"],
  ["ne", "nebraska"],
  ["nv", "nevada"],
  ["nh", "new hampshire"],
  ["nj", "new jersey"],
  ["nm", "new mexico"],
  ["ny", "new york"],
  ["nc", "north carolina"],
  ["nd", "north dakota"],
  ["oh", "ohio"],
  ["ok", "oklahoma"],
  ["or", "oregon"],
  ["pa", "pennsylvania"],
  ["ri", "rhode island"],
  ["sc", "south carolina"],
  ["sd", "south dakota"],
  ["tn", "tennessee"],
  ["tx", "texas"],
  ["ut", "utah"],
  ["vt", "vermont"],
  ["va", "virginia"],
  ["wa", "washington"],
  ["wv", "west virginia"],
  ["wi", "wisconsin"],
  ["wy", "wyoming"],
] as const;

/**
 * US state codes that are also ISO country codes ("IL" = Illinois or
 * Israel). A bare code like this is never read as a state; only a known
 * city before it ("Chicago, IL") can place it.
 */
// prettier-ignore
const AMBIGUOUS_CODES = new Set([
  "al", "ar", "ca", "co", "de", "ga", "id", "il", "in", "la", "ma", "md",
  "me", "mn", "mo", "ms", "mt", "nc", "ne", "pa", "sc", "sd", "tn", "va",
]);

/**
 * Place key → country code. ICU English names (long and short) for every
 * code, then aliases, then US states. "georgia" stays the country: US
 * Georgia places are written "…, Georgia, United States".
 */
const COUNTRY_BY_NAME: ReadonlyMap<string, StartupCountryCode> = (() => {
  const byName = new Map<string, StartupCountryCode>();
  const add = (name: string | undefined, code: StartupCountryCode) => {
    const key = normalizeStartupPlaceKey(name);
    // Two-letter keys are codes, not names; only the explicit aliases
    // ("us", "uk") may claim one.
    if (key && key.length > 2 && !byName.has(key)) byName.set(key, code);
  };
  for (const style of ["long", "short"] as const) {
    const names = new Intl.DisplayNames(["en"], { type: "region", style });
    for (const code of STARTUP_COUNTRY_CODES) add(names.of(code), code);
  }
  for (const [alias, code] of Object.entries(COUNTRY_ALIASES)) {
    byName.set(alias, code);
  }
  byName.set("us", "US");
  byName.set("uk", "GB");
  for (const [code, name] of US_STATES) {
    byName.set(name, "US");
    if (!AMBIGUOUS_CODES.has(code)) byName.set(code, "US");
  }
  return byName;
})();

/** Places that span several countries, or none. */
const NOT_A_COUNTRY =
  /^(remote|worldwide|global|hybrid|online|distributed|middle east|europe|emea|apac|latam|asia|africa|north america|south america|oceania)$/;

export type StartupPlaceClass =
  | { kind: "country"; code: StartupCountryCode }
  /** Remote, multi-region, or blank: there is no single country to find. */
  | { kind: "none" }
  /** A place this list cannot name. `query` is the first sourced place. */
  | { kind: "unknown"; query: string };

export function classifyStartupPlace(
  region: string | null | undefined,
): StartupPlaceClass {
  const place = region?.split(";")[0]?.trim();
  if (!place) return { kind: "none" };
  const parts = place
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = normalizeStartupPlaceKey(parts.at(-1));
  if (!last || NOT_A_COUNTRY.test(last)) return { kind: "none" };

  const named = COUNTRY_BY_NAME.get(last);
  if (named) return { kind: "country", code: named };

  const centroid = startupPlaceCentroid(place);
  if (centroid) return { kind: "country", code: centroid.country };

  return { kind: "unknown", query: parts.join(", ") };
}

/** Country from the local lists only; no geocoder. */
export function startupCountryCodeOf(
  region: string | null | undefined,
): StartupCountryCode | null {
  const place = classifyStartupPlace(region);
  return place.kind === "country" ? place.code : null;
}

const LABELS: Record<StartupLocale, Intl.DisplayNames> = {
  en: new Intl.DisplayNames(["en"], { type: "region" }),
  nl: new Intl.DisplayNames(["nl"], { type: "region" }),
};

/** Country name in the page language. */
export function startupCountryLabel(
  code: StartupCountryCode,
  locale: StartupLocale,
): string {
  return LABELS[locale].of(code) ?? code;
}
