/**
 * City / region centroids for approximate Startups map pins.
 * Place data only — never company rows, never street addresses.
 */
import type { StartupCountryCode } from "./startups-countries";

export type StartupPlaceKind = "city" | "region";

export type StartupPlaceCentroid = {
  lat: number;
  lng: number;
  kind: StartupPlaceKind;
  /** ISO 3166-1 alpha-2 code of the country this place is in. */
  country: StartupCountryCode;
};

const STREET_WORD =
  /\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|suite|ste\.?|floor|fl\.?)\b/i;

const NON_PLACE_SEGMENT =
  /^(remote|worldwide|global|hybrid|online|distributed)$/;

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeStartupPlaceKey(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  return stripDiacritics(trimmed)
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .replace(/,\s*/g, ", ");
}

export function isStreetLikeStartupPlace(
  value: string | null | undefined,
): boolean {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return false;
  return /\d/.test(trimmed) && STREET_WORD.test(trimmed);
}

function city(
  lat: number,
  lng: number,
  country: StartupCountryCode,
): StartupPlaceCentroid {
  return { lat, lng, kind: "city", country };
}

function region(
  lat: number,
  lng: number,
  country: StartupCountryCode,
): StartupPlaceCentroid {
  return { lat, lng, kind: "region", country };
}

function alias(
  keys: readonly string[],
  place: StartupPlaceCentroid,
): Record<string, StartupPlaceCentroid> {
  return Object.fromEntries(keys.map((key) => [key, place]));
}

const TORONTO = city(43.6532, -79.3832, "CA");
const NEW_YORK = city(40.7128, -74.006, "US");
const SAN_FRANCISCO = city(37.7749, -122.4194, "US");
const PALO_ALTO = city(37.4419, -122.143, "US");
const LONDON = city(51.5074, -0.1278, "GB");
const PARIS = city(48.8566, 2.3522, "FR");
const AMSTERDAM = city(52.3676, 4.9041, "NL");
const BERLIN = city(52.52, 13.405, "DE");
const SINGAPORE = city(1.3521, 103.8198, "SG");
const AUSTIN = city(30.2672, -97.7431, "US");
const SEATTLE = city(47.6062, -122.3321, "US");
const BOSTON = city(42.3601, -71.0589, "US");
const LOS_ANGELES = city(34.0522, -118.2437, "US");
const TEL_AVIV = city(32.0853, 34.7818, "IL");
const JERUSALEM = city(31.7683, 35.2137, "IL");
const HAIFA = city(32.794, 34.9896, "IL");
const HERZLIYA = city(32.1624, 34.8447, "IL");
const BENGALURU = city(12.9716, 77.5946, "IN");
const FRANKFURT = city(50.1109, 8.6821, "DE");
const DALLAS = city(32.7767, -96.797, "US");
const LIMERICK = city(52.6638, -8.6267, "IE");
const DUBLIN = city(53.3498, -6.2603, "IE");
const CHICAGO = city(41.8781, -87.6298, "US");
const DENVER = city(39.7392, -104.9903, "US");
const MIAMI = city(25.7617, -80.1918, "US");
const ATLANTA = city(33.749, -84.388, "US");
const WASHINGTON = city(38.9072, -77.0369, "US");
const MUNICH = city(48.1351, 11.582, "DE");
const ZURICH = city(47.3769, 8.5417, "CH");
const STOCKHOLM = city(59.3293, 18.0686, "SE");
const MADRID = city(40.4168, -3.7038, "ES");
const BARCELONA = city(41.3874, 2.1686, "ES");
const MILAN = city(45.4642, 9.19, "IT");
const TOKYO = city(35.6762, 139.6503, "JP");
const SEOUL = city(37.5665, 126.978, "KR");
const SYDNEY = city(-33.8688, 151.2093, "AU");
const VANCOUVER = city(49.2827, -123.1207, "CA");
const MONTREAL = city(45.5017, -73.5673, "CA");
const CAMBRIDGE = city(42.3736, -71.1097, "US");
const MOUNTAIN_VIEW = city(37.3861, -122.0839, "US");
const MENLO_PARK = city(37.453, -122.1817, "US");
const REDWOOD_CITY = city(37.4852, -122.2364, "US");
const OAKLAND = city(37.8044, -122.2712, "US");

const CALIFORNIA = region(36.7783, -119.4179, "US");
const TEXAS = region(31.9686, -99.9018, "US");
const NETHERLANDS = region(52.1326, 5.2913, "NL");
const ISRAEL = region(31.0461, 34.8516, "IL");
const UNITED_STATES = region(39.8283, -98.5795, "US");
const UNITED_KINGDOM = region(55.3781, -3.436, "GB");
const FRANCE = region(46.2276, 2.2137, "FR");
const GERMANY = region(51.1657, 10.4515, "DE");
const INDIA = region(20.5937, 78.9629, "IN");
const IRELAND = region(53.1424, -7.6921, "IE");
const CANADA = region(56.1304, -106.3468, "CA");
const AUSTRALIA = region(-25.2744, 133.7751, "AU");
const SWITZERLAND = region(46.8182, 8.2275, "CH");
const SWEDEN = region(60.1282, 18.6435, "SE");
const SPAIN = region(40.4637, -3.7492, "ES");
const ITALY = region(41.8719, 12.5674, "IT");
const JAPAN = region(36.2048, 138.2529, "JP");
const SOUTH_KOREA = region(35.9078, 127.7669, "KR");
const BRAZIL = region(-14.235, -51.9253, "BR");
const UAE = region(23.4241, 53.8478, "AE");
const ESTONIA = region(58.5953, 25.0136, "EE");
const FINLAND = region(61.9241, 25.7482, "FI");
const NORWAY = region(60.472, 8.4689, "NO");
const DENMARK = region(56.2639, 9.5018, "DK");
const BELGIUM = region(50.5039, 4.4699, "BE");
const AUSTRIA = region(47.5162, 14.5501, "AT");
const POLAND = region(51.9194, 19.1451, "PL");
const PORTUGAL = region(39.3999, -8.2245, "PT");
const CZECHIA = region(49.8175, 15.473, "CZ");
const ROMANIA = region(45.9432, 24.9668, "RO");
const UKRAINE = region(48.3794, 31.1656, "UA");
const MEXICO = region(23.6345, -102.5528, "MX");
const ARGENTINA = region(-38.4161, -63.6167, "AR");
const CHILE = region(-35.6751, -71.543, "CL");
const SOUTH_AFRICA = region(-30.5595, 22.9375, "ZA");
const CHINA = region(35.8617, 104.1954, "CN");
const TAIWAN = region(23.6978, 120.9605, "TW");
const HONG_KONG = region(22.3193, 114.1694, "HK");
const NEW_ZEALAND = region(-40.9006, 174.886, "NZ");
const TURKEY = region(38.9637, 35.2433, "TR");
const GREECE = region(39.0742, 21.8243, "GR");
const HUNGARY = region(47.1625, 19.5033, "HU");
const LUXEMBOURG = region(49.8153, 6.1296, "LU");
const LITHUANIA = region(55.1694, 23.8813, "LT");
const LATVIA = region(56.8796, 24.6032, "LV");
const ICELAND = region(64.9631, -19.0208, "IS");
const NIGERIA = region(9.082, 8.6753, "NG");
const KENYA = region(-0.0236, 37.9062, "KE");
const INDONESIA = region(-0.7893, 113.9213, "ID");
const VIETNAM = region(14.0583, 108.2772, "VN");
const THAILAND = region(15.87, 100.9925, "TH");
const PHILIPPINES = region(12.8797, 121.774, "PH");
const MALAYSIA = region(4.2105, 101.9758, "MY");
const SAUDI_ARABIA = region(23.8859, 45.0792, "SA");
const QATAR = region(25.3548, 51.1839, "QA");
const EGYPT = region(26.8206, 30.8025, "EG");
const COLOMBIA = region(4.5709, -74.2973, "CO");
const PERU = region(-9.19, -75.0152, "PE");
const SINGAPORE_REGION = region(1.3521, 103.8198, "SG");

/** Canonical city/region centroids. Keys are normalizeStartupPlaceKey aliases. */
const PLACE_CENTROIDS: Record<string, StartupPlaceCentroid> = {
  ...alias(["toronto, canada", "toronto", "toronto, on"], TORONTO),
  ...alias(
    [
      "new york, us",
      "new york, usa",
      "new york, united states",
      "new york",
      "nyc",
      "new york city",
      "new york city, ny, usa",
      "new york, ny",
      "new york, ny, usa",
    ],
    NEW_YORK,
  ),
  ...alias(
    [
      "san francisco, us",
      "san francisco",
      "san francisco, ca",
      "san francisco, ca, usa",
      "san francisco, california",
      "sf",
      "sf bay area",
      "bay area",
      "silicon valley",
    ],
    SAN_FRANCISCO,
  ),
  ...alias(["palo alto, us", "palo alto", "palo alto, ca"], PALO_ALTO),
  ...alias(
    [
      "london, uk",
      "london",
      "london, england",
      "london, england, united kingdom",
    ],
    LONDON,
  ),
  ...alias(
    [
      "paris, france",
      "paris",
      "paris, ile-de-france",
      "paris, ile-de-france, france",
    ],
    PARIS,
  ),
  ...alias(["amsterdam, netherlands", "amsterdam"], AMSTERDAM),
  ...alias(["berlin, germany", "berlin"], BERLIN),
  ...alias(["singapore"], SINGAPORE),
  ...alias(["austin, us", "austin", "austin, tx", "austin, tx, usa"], AUSTIN),
  ...alias(
    ["seattle, us", "seattle", "seattle, wa", "seattle, wa, usa"],
    SEATTLE,
  ),
  ...alias(["boston, us", "boston", "boston, ma", "boston, ma, usa"], BOSTON),
  ...alias(
    [
      "los angeles, us",
      "los angeles",
      "los angeles, ca",
      "los angeles, ca, usa",
    ],
    LOS_ANGELES,
  ),
  ...alias(
    ["tel aviv", "tel aviv, israel", "tel aviv-yafo", "tel aviv yafo"],
    TEL_AVIV,
  ),
  ...alias(["jerusalem", "jerusalem, israel"], JERUSALEM),
  ...alias(["haifa", "haifa, israel"], HAIFA),
  ...alias(["herzliya", "herzliya, israel"], HERZLIYA),
  ...alias(["bengaluru", "bangalore", "bengaluru, ka, india"], BENGALURU),
  ...alias(
    ["frankfurt", "frankfurt am main", "frankfurt am main, hesse, germany"],
    FRANKFURT,
  ),
  ...alias(
    ["dallas", "dallas, texas", "dallas, texas, united states", "dallas, tx"],
    DALLAS,
  ),
  ...alias(["limerick", "limerick, ireland"], LIMERICK),
  ...alias(["dublin", "dublin, ireland"], DUBLIN),
  ...alias(["chicago", "chicago, il", "chicago, il, usa"], CHICAGO),
  ...alias(["denver", "denver, co", "denver, co, usa"], DENVER),
  ...alias(["miami", "miami, fl", "miami, fl, usa"], MIAMI),
  ...alias(["atlanta", "atlanta, ga", "atlanta, ga, usa"], ATLANTA),
  ...alias(
    ["washington", "washington, dc", "washington, dc, usa", "washington dc"],
    WASHINGTON,
  ),
  ...alias(["munich", "munich, germany"], MUNICH),
  ...alias(["zurich", "zurich, switzerland"], ZURICH),
  ...alias(["stockholm", "stockholm, sweden"], STOCKHOLM),
  ...alias(["madrid", "madrid, spain"], MADRID),
  ...alias(["barcelona", "barcelona, spain"], BARCELONA),
  ...alias(["milan", "milan, italy"], MILAN),
  ...alias(["tokyo", "tokyo, japan"], TOKYO),
  ...alias(["seoul", "seoul, south korea"], SEOUL),
  ...alias(["sydney", "sydney, australia"], SYDNEY),
  ...alias(["vancouver", "vancouver, canada"], VANCOUVER),
  ...alias(["montreal", "montreal, canada"], MONTREAL),
  ...alias(["cambridge", "cambridge, ma", "cambridge, ma, usa"], CAMBRIDGE),
  ...alias(["mountain view", "mountain view, ca"], MOUNTAIN_VIEW),
  ...alias(["menlo park", "menlo park, ca"], MENLO_PARK),
  ...alias(["redwood city", "redwood city, ca"], REDWOOD_CITY),
  ...alias(["oakland", "oakland, ca"], OAKLAND),
  ...alias(["california, us", "california", "ca"], CALIFORNIA),
  ...alias(["texas", "tx"], TEXAS),
  ...alias(["netherlands", "the netherlands"], NETHERLANDS),
  ...alias(["israel"], ISRAEL),
  ...alias(
    ["united states", "usa", "us", "united states of america"],
    UNITED_STATES,
  ),
  ...alias(
    ["united kingdom", "uk", "great britain", "england", "britain"],
    UNITED_KINGDOM,
  ),
  ...alias(["france"], FRANCE),
  ...alias(["germany"], GERMANY),
  ...alias(["india"], INDIA),
  ...alias(["ireland"], IRELAND),
  ...alias(["canada"], CANADA),
  ...alias(["australia"], AUSTRALIA),
  ...alias(["switzerland"], SWITZERLAND),
  ...alias(["sweden"], SWEDEN),
  ...alias(["spain"], SPAIN),
  ...alias(["italy"], ITALY),
  ...alias(["japan"], JAPAN),
  ...alias(["south korea", "korea"], SOUTH_KOREA),
  ...alias(["brazil"], BRAZIL),
  ...alias(["united arab emirates", "uae"], UAE),
  ...alias(["estonia"], ESTONIA),
  ...alias(["finland"], FINLAND),
  ...alias(["norway"], NORWAY),
  ...alias(["denmark"], DENMARK),
  ...alias(["belgium"], BELGIUM),
  ...alias(["austria"], AUSTRIA),
  ...alias(["poland"], POLAND),
  ...alias(["portugal"], PORTUGAL),
  ...alias(["czech republic", "czechia"], CZECHIA),
  ...alias(["romania"], ROMANIA),
  ...alias(["ukraine"], UKRAINE),
  ...alias(["mexico"], MEXICO),
  ...alias(["argentina"], ARGENTINA),
  ...alias(["chile"], CHILE),
  ...alias(["south africa"], SOUTH_AFRICA),
  ...alias(["china"], CHINA),
  ...alias(["taiwan"], TAIWAN),
  ...alias(["hong kong"], HONG_KONG),
  ...alias(["new zealand"], NEW_ZEALAND),
  ...alias(["turkey", "turkiye"], TURKEY),
  ...alias(["greece"], GREECE),
  ...alias(["hungary"], HUNGARY),
  ...alias(["luxembourg"], LUXEMBOURG),
  ...alias(["lithuania"], LITHUANIA),
  ...alias(["latvia"], LATVIA),
  ...alias(["iceland"], ICELAND),
  ...alias(["nigeria"], NIGERIA),
  ...alias(["kenya"], KENYA),
  ...alias(["indonesia"], INDONESIA),
  ...alias(["vietnam"], VIETNAM),
  ...alias(["thailand"], THAILAND),
  ...alias(["philippines"], PHILIPPINES),
  ...alias(["malaysia"], MALAYSIA),
  ...alias(["saudi arabia"], SAUDI_ARABIA),
  ...alias(["qatar"], QATAR),
  ...alias(["egypt"], EGYPT),
  ...alias(["colombia"], COLOMBIA),
  ...alias(["peru"], PERU),
  ...alias(["singapore, singapore"], SINGAPORE_REGION),
};

function addUnique(keys: string[], seen: Set<string>, key: string | null) {
  if (!key || seen.has(key) || NON_PLACE_SEGMENT.test(key)) return;
  seen.add(key);
  keys.push(key);
}

/**
 * Candidate keys from most specific (full sourced string) to country.
 * Semicolon tails like "; Remote" are dropped, not pinned.
 */
export function startupPlaceCandidateKeys(
  value: string | null | undefined,
): string[] {
  const key = normalizeStartupPlaceKey(value);
  if (!key) return [];
  if (NON_PLACE_SEGMENT.test(key)) return [];

  const keys: string[] = [];
  const seen = new Set<string>();
  addUnique(keys, seen, key);

  const chunks = key
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part && !NON_PLACE_SEGMENT.test(part));

  for (const chunk of chunks) {
    addUnique(keys, seen, chunk);
    const parts = chunk
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) continue;
    addUnique(keys, seen, parts[0] ?? null);
    if (parts.length > 1) {
      addUnique(keys, seen, `${parts[0]}, ${parts[1]}`);
    }
    for (const part of parts.slice(1)) {
      addUnique(keys, seen, part);
    }
  }

  return keys;
}

export function startupPlaceCentroid(
  value: string | null | undefined,
): StartupPlaceCentroid | null {
  if (isStreetLikeStartupPlace(value)) return null;
  for (const key of startupPlaceCandidateKeys(value)) {
    const hit = PLACE_CENTROIDS[key];
    if (hit) return hit;
  }
  return null;
}

/** The place list entry for exactly this place, with no partial matches. */
export function startupPlaceByKey(
  value: string | null | undefined,
): StartupPlaceCentroid | null {
  if (isStreetLikeStartupPlace(value)) return null;
  const key = normalizeStartupPlaceKey(value);
  return key ? (PLACE_CENTROIDS[key] ?? null) : null;
}

export function sourcedStartupPlaceLabel(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (isStreetLikeStartupPlace(trimmed)) return null;
  return trimmed;
}
