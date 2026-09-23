/**
 * Country of a sourced place string, for Insights grouping.
 *
 * Sourced regions are free text ("San Francisco, CA, USA; Remote",
 * "Wamego, Kansas, United States", "Silicon Valley"). The country is the last
 * comma part of the first ";" place, folded through a small alias list so
 * "USA", "United States", and US states count once. Anything that is not a
 * single country ("Remote", "Middle East") returns null. An unknown last
 * part is kept as written: it is sourced, just not aliased.
 */

const UNITED_STATES = "United States";
const UNITED_KINGDOM = "United Kingdom";

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
 * Israel). Guessing would move companies between countries, so these, and
 * any other bare two-letter code, stay unplaced.
 */
const AMBIGUOUS_CODES = new Set([
  "al",
  "ar",
  "ca",
  "co",
  "de",
  "ga",
  "id",
  "il",
  "in",
  "la",
  "ma",
  "md",
  "me",
  "mn",
  "mo",
  "ms",
  "mt",
  "nc",
  "ne",
  "pa",
  "sc",
  "sd",
  "tn",
  "va",
]);

// "georgia" is left out on purpose: it is also a country, and US Georgia
// places are written "…, Georgia, United States", ending in the country.
const COUNTRY_ALIASES: Record<string, string> = {
  usa: UNITED_STATES,
  us: UNITED_STATES,
  "united states": UNITED_STATES,
  "united states of america": UNITED_STATES,
  "silicon valley": UNITED_STATES,
  "bay area": UNITED_STATES,
  "san francisco": UNITED_STATES,
  "new york city": UNITED_STATES,
  boston: UNITED_STATES,
  "los angeles": UNITED_STATES,
  chicago: UNITED_STATES,
  seattle: UNITED_STATES,
  austin: UNITED_STATES,
  uk: UNITED_KINGDOM,
  "united kingdom": UNITED_KINGDOM,
  "great britain": UNITED_KINGDOM,
  england: UNITED_KINGDOM,
  scotland: UNITED_KINGDOM,
  wales: UNITED_KINGDOM,
  london: UNITED_KINGDOM,
  uae: "United Arab Emirates",
  "united arab emirates": "United Arab Emirates",
  korea: "South Korea",
  "south korea": "South Korea",
  "republic of korea": "South Korea",
  "the netherlands": "Netherlands",
  holland: "Netherlands",
  ...Object.fromEntries(
    US_STATES.flatMap(([code, name]) =>
      AMBIGUOUS_CODES.has(code)
        ? [[name, UNITED_STATES]]
        : [
            [code, UNITED_STATES],
            [name, UNITED_STATES],
          ],
    ),
  ),
};

/** Places that span several countries, or none. */
const NOT_A_COUNTRY =
  /^(remote|worldwide|global|hybrid|online|distributed|middle east|europe|emea|apac|latam|asia|africa|north america|south america)$/;

function placeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

export function startupCountryOf(
  region: string | null | undefined,
): string | null {
  const place = region?.split(";")[0]?.trim();
  if (!place) return null;
  const last = place.split(",").at(-1)!.trim();
  const key = placeKey(last);
  if (!key || NOT_A_COUNTRY.test(key)) return null;
  const alias = COUNTRY_ALIASES[key];
  if (alias) return alias;
  return key.length <= 2 ? null : last;
}
