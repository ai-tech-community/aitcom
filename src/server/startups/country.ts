import {
  classifyStartupPlace,
  isStartupCountryCode,
  type StartupCountryCode,
} from "@/lib/investigations/startups-countries";
import { normalizeStartupPlaceKey } from "@/lib/investigations/startups-places";
import {
  searchPlaces,
  type PlaceCandidate,
} from "@/server/geocoding/nominatim";

/** Looks up the country of a place the local lists cannot name. */
export type StartupCountryGeocoder = (
  query: string,
) => Promise<StartupCountryCode | null>;

/** Place key that reads German spellings as one (ü = ue, ß = ss). */
function nameKey(value: string | null | undefined): string | null {
  const key = normalizeStartupPlaceKey(value);
  if (!key) return null;
  return key
    .replace(/ß/g, "ss")
    .replace(/([aou])e/g, "$1")
    .replace(/^the /, "");
}

function namesOf(match: PlaceCandidate): string[] {
  return [match.name, match.nameEn]
    .map(nameKey)
    .filter((key): key is string => key !== null);
}

/**
 * Country of the best settlement match. Nominatim ranks by importance and
 * also matches other-language names ("Noordwijk" is Norwich in Dutch). So:
 * the top match when its name is the text or begins with it ("Halle" →
 * "Halle (Saale)"); else the first match named exactly as written; else the
 * top match.
 */
export const geocodeStartupCountry: StartupCountryGeocoder = async (query) => {
  const matches = await searchPlaces(query);
  const wanted = nameKey(query);
  const [top] = matches;
  if (!top || !wanted) return null;
  const topFits = namesOf(top).some(
    (name) => name === wanted || name.startsWith(`${wanted} `),
  );
  const best = topFits
    ? top
    : (matches.find((match) => namesOf(match).includes(wanted)) ?? top);
  return isStartupCountryCode(best.countryCode) ? best.countryCode : null;
};

export type StartupCountryResolver = (
  region: string | null | undefined,
) => Promise<StartupCountryCode | null>;

/**
 * Country for a startup's sourced region, stored at write time. Local lists
 * first; the geocoder only for a place they cannot name. One resolver
 * remembers each place, so a batch or backfill geocodes a name once.
 */
export function createStartupCountryResolver(
  geocode: StartupCountryGeocoder = geocodeStartupCountry,
): StartupCountryResolver {
  const lookups = new Map<string, Promise<StartupCountryCode | null>>();
  return async (region) => {
    const place = classifyStartupPlace(region);
    if (place.kind === "country") return place.code;
    if (place.kind === "none") return null;
    const key = normalizeStartupPlaceKey(place.query) ?? place.query;
    let lookup = lookups.get(key);
    if (!lookup) {
      lookup = geocode(place.query).catch(() => null);
      lookups.set(key, lookup);
    }
    return lookup;
  };
}

/**
 * Country to store with a write. An edit that keeps the same region keeps
 * the stored country, so saving a card does not geocode it again.
 */
export async function startupCountryForWrite(
  region: string | null,
  resolve: StartupCountryResolver,
  existing?: { region: string | null; country: string | null },
): Promise<StartupCountryCode | null> {
  if (existing?.region === region && isStartupCountryCode(existing.country)) {
    return existing.country;
  }
  return resolve(region);
}

export type StartupCountryBackfillGroup = {
  region: string | null;
  country: StartupCountryCode | null;
  ids: string[];
  /**
   * Rows to write: stored country differs from `country`. Never a row that
   * would lose a stored country to a null result (a failed lookup).
   */
  stale: string[];
};

/** One group per distinct region, resolved once. Largest first. */
export async function planStartupCountryBackfill(
  rows: ReadonlyArray<{
    id: string;
    region: string | null;
    country: string | null;
  }>,
  resolve: StartupCountryResolver,
): Promise<StartupCountryBackfillGroup[]> {
  const byRegion = new Map<string | null, typeof rows>();
  for (const row of rows) {
    byRegion.set(row.region, [...(byRegion.get(row.region) ?? []), row]);
  }
  const groups: StartupCountryBackfillGroup[] = [];
  for (const [region, members] of byRegion) {
    const country = await resolve(region);
    groups.push({
      region,
      country,
      ids: members.map((row) => row.id),
      stale: country
        ? members.filter((row) => row.country !== country).map((row) => row.id)
        : [],
    });
  }
  return groups.sort((a, b) => b.ids.length - a.ids.length);
}
