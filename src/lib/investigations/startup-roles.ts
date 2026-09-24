import { slugify } from "@/lib/text-utils";
import {
  STARTUPS_JOBS_PATH,
  STARTUPS_PAGE_SIZE,
  parseStartupSlug,
  presentText,
} from "./startups";

export const STARTUP_ROLE_TITLE_MAX = 200;

export const STARTUP_ROLE_LOCATION_MAX = 240;

export const STARTUP_ROLE_DESCRIPTION_MAX = 20_000;

export const STARTUP_ROLE_SLUG_MAX = 80;

export const STARTUP_ROLES_PER_COMPANY_CAP = 40;

/** JD HTML fetches per company, including ATS rows that omitted description text. */
export const STARTUP_ROLE_ENRICH_CAP = STARTUP_ROLES_PER_COMPANY_CAP;

export const STARTUP_ROLE_FETCH_TIMEOUT_MS = 12_000;

export const STARTUP_ROLE_USER_AGENT =
  "AITCommunityStartupsBot/1.0 (+https://www.aitcommunity.org/startups)";

export type StartupRoleBoard =
  | "ashby"
  | "greenhouse"
  | "lever"
  | "workable"
  | "html"
  | "unknown";

export type StartupRoleStatus = "open" | "closed" | "pending_review";

export type StartupRolePublic = {
  id: string;
  startupId: string;
  startupSlug: string;
  startupName: string;
  startupLogoUrl: string | null;
  slug: string;
  title: string;
  location: string | null;
  workType: string | null;
  sourceUrl: string;
  applyUrl: string | null;
  descriptionText: string | null;
  fetchedAt: string;
  /**
   * When this directory first stored the role.
   * Not the employer's publish date and not a scan timestamp to display.
   */
  listedAt?: string | null;
  /** ATS / careers-board published date. Never a scan or crawl timestamp. */
  postedAt?: string | null;
  board: StartupRoleBoard;
  status: "open" | "closed";
};

/**
 * A role as the jobs list shows it. The description is left out on purpose:
 * all open descriptions together are tens of megabytes, and the list never
 * renders them. Full-text search reads them in the database instead.
 */
export type StartupRoleListing = Omit<StartupRolePublic, "descriptionText">;

/**
 * Role ids the full-text search index matched for `query.q`, or `null` when
 * the query has no search terms and no text filter applies.
 */
export type StartupRoleTextMatches = ReadonlySet<string> | null;

export type ExtractedJobListing = {
  title: string;
  sourceUrl: string;
  applyUrl: string | null;
  location: string | null;
  workType: string | null;
  descriptionText: string | null;
  externalId: string | null;
  /** ATS publish date as YYYY-MM-DD. Never a scan or crawl timestamp. */
  postedAt: string | null;
  board: StartupRoleBoard;
};

/** Company first: it groups each company's roles together. */
export const STARTUP_JOBS_SORTS = ["company", "role", "location"] as const;

export type StartupJobsSort = (typeof STARTUP_JOBS_SORTS)[number];

export const STARTUP_JOBS_DEFAULT_SORT: StartupJobsSort = "company";

/**
 * Location filter value meaning "remote-friendly": any role whose sourced
 * location or work type mentions remote. A facet value rather than a new
 * param, so saved searches keep working without a schema change.
 */
export const STARTUP_JOBS_REMOTE = "remote";

/** Canonical employment types that careers boards spell many ways. */
export const STARTUP_WORK_TYPES = [
  "full-time",
  "part-time",
  "contract",
  "internship",
  "temporary",
] as const;

export type StartupWorkType = (typeof STARTUP_WORK_TYPES)[number];

export const STARTUP_WORK_TYPE_LABELS: Record<
  StartupWorkType,
  Record<"en" | "nl", string>
> = {
  "full-time": { en: "Full-time", nl: "Voltijd" },
  "part-time": { en: "Part-time", nl: "Deeltijd" },
  contract: { en: "Contract", nl: "Contract" },
  internship: { en: "Internship", nl: "Stage" },
  temporary: { en: "Temporary", nl: "Tijdelijk" },
};

/**
 * Employment type of a sourced work-type string ("FullTime", "Salaried,
 * full-time", "Contractor"). Unknown text returns null, never a guess.
 */
export function startupWorkTypeOf(
  value: string | null | undefined,
): StartupWorkType | null {
  const text = value?.toLowerCase() ?? "";
  if (!text.trim()) return null;
  if (/\bintern|graduate/.test(text)) return "internship";
  if (/contract|freelance/.test(text)) return "contract";
  if (/part[\s-]?time/.test(text)) return "part-time";
  if (/\btemp/.test(text)) return "temporary";
  if (/full[\s-]?time|salaried|permanent/.test(text)) return "full-time";
  return null;
}

/** The sourced location or work type says remote work is possible. */
export function isRemoteFriendlyRole(
  role: Pick<StartupRolePublic, "location" | "workType">,
): boolean {
  return /\bremote\b/i.test(`${role.location ?? ""} ${role.workType ?? ""}`);
}

/** Filter options, drawn only from values the listed roles actually have. */
export function startupJobsFacets(roles: readonly StartupRoleListing[]): {
  companies: Array<{ slug: string; name: string; logoUrl: string | null }>;
  locations: string[];
  workTypes: StartupWorkType[];
  remote: number;
} {
  const companies = new Map<
    string,
    { slug: string; name: string; logoUrl: string | null }
  >();
  const locations = new Map<string, string>();
  const workTypes = new Set<StartupWorkType>();
  let remote = 0;
  for (const role of roles) {
    if (!companies.has(role.startupSlug)) {
      companies.set(role.startupSlug, {
        slug: role.startupSlug,
        name: role.startupName,
        logoUrl: role.startupLogoUrl,
      });
    }
    const location = presentText(role.location);
    // One option per spelling that differs only in case or spacing.
    if (location) {
      const key = location.toLowerCase().replace(/\s+/g, " ");
      if (key !== STARTUP_JOBS_REMOTE && !locations.has(key)) {
        locations.set(key, location);
      }
    }
    const workType = startupWorkTypeOf(role.workType);
    if (workType) workTypes.add(workType);
    if (isRemoteFriendlyRole(role)) remote += 1;
  }
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return {
    companies: [...companies.values()].sort((a, b) =>
      collator.compare(a.name, b.name),
    ),
    locations: [...locations.values()].sort((a, b) => collator.compare(a, b)),
    workTypes: STARTUP_WORK_TYPES.filter((id) => workTypes.has(id)),
    remote,
  };
}

export type StartupJobsQuery = {
  company: string;
  q: string;
  location: string;
  workType: string;
  sort: StartupJobsSort;
  page: number;
};

/** Saved jobs-table search. Empty fields mean that filter is unset. */
export type StartupJobsFollow = {
  company: string;
  q: string;
  location: string;
  workType: string;
};

export const STARTUP_JOBS_FOLLOW_Q_MAX = 200;

/** Work-type tokens that leak from card chrome into the title. */
const TITLE_WORK_TYPE_LINE =
  /^(?:full[- ]?time|part[- ]?time|contract(?:or|ing)?|temporary|internship|intern|volunteer|per[ -]?diem|freelance|permanent)$/i;

/** CTA labels nested in the same careers-card anchor as the role. */
const TITLE_CTA_LINE =
  /^(?:read more|more info|learn more|apply(?: now)?|see (?:position )?details|view (?:position(?:\s*(?:&|and)\s*apply)?|role)|למידע נוסף|north_east)$/i;

const TITLE_TRAILING_META =
  /\s+(?:full[- ]?time|part[- ]?time|contract(?:or|ing)?|temporary|internship|intern|volunteer|per[ -]?diem|freelance|permanent|read more|more info|learn more|apply now)$/i;

/**
 * A whole line that is only a place / work-mode label, not a role name.
 * Role titles that embed a place (“Team Lead, Canada”) stay intact.
 */
const TITLE_LOCATION_LINE =
  /^(?:remote|hybrid|onsite|on-site|in[- ]office)(?:\s*[·|,/()-].*)?$|^(?:[\p{L}\s.'’()-]+)\s*\((?:remote|hybrid|onsite|on-site)\)\s*$|^(?:tel-?aviv|toronto|chicago|canada|usa|u\.?s\.?a\.?|united states|arizona|turkey|texas|haifa|bengaluru|taiwan|england|israel|india|europe)(?:\s*[,/·-]\s*[\p{L}\s.'’()-]+)?$/iu;

const OCR_SECTION_GLUE =
  /^[a-z]{1,8}(?=(?:About|Overview|Introduction|Responsibilities|Requirements|Qualifications|The role)\b)/;

const DESCRIPTION_LEADING_CTA = /^(?:read more|more info|learn more)\s*/i;

function isTitleMetaLine(line: string): boolean {
  const text = line.trim();
  if (!text) return true;
  return (
    TITLE_WORK_TYPE_LINE.test(text) ||
    TITLE_CTA_LINE.test(text) ||
    TITLE_LOCATION_LINE.test(text)
  );
}

/**
 * Role name only: drop card chrome (work type, location, CTA) and leading
 * asterisks. When a department label sits above the role, keep the role line.
 */
export function cleanStartupRoleTitle(
  value: string | null | undefined,
): string | null {
  const raw = presentText(value);
  if (!raw) return null;
  let lines = raw
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\*+\s*/, "").trim())
    .filter(Boolean);
  lines = lines.filter((line) => !isTitleMetaLine(line));
  if (lines.length === 0) return null;
  let title =
    lines.length === 1
      ? (lines[0] ?? "")
      : (lines.reduce((best, line) =>
          line.length >= best.length ? line : best,
        ) ?? "");
  while (TITLE_TRAILING_META.test(title)) {
    title = title.replace(TITLE_TRAILING_META, "").trim();
  }
  title = title.trim();
  if (!title || title.length > STARTUP_ROLE_TITLE_MAX) return null;
  return title;
}

export function parseStartupRoleTitle(
  value: string | null | undefined,
): string | null {
  return cleanStartupRoleTitle(value);
}

export function parseStartupRoleLocation(
  value: string | null | undefined,
): string | null {
  const location = presentText(value);
  if (!location || location.length > STARTUP_ROLE_LOCATION_MAX) return null;
  return location;
}

export function sanitizeStartupRoleDescription(
  value: string | null | undefined,
): string | null {
  let text = presentText(value);
  if (!text) return null;
  text = text.replace(OCR_SECTION_GLUE, "");
  text = text.replace(DESCRIPTION_LEADING_CTA, "").trimStart();
  text = text.replace(/(?:\n|^)\s*(?:read more|more info)\s*$/i, "").trim();
  if (!text) return null;
  return text.slice(0, STARTUP_ROLE_DESCRIPTION_MAX);
}

export function startupRoleSlugFromTitle(
  startupSlug: string,
  title: string,
): string {
  const company = parseStartupSlug(startupSlug) ?? "startup";
  const role = slugify(title).slice(0, STARTUP_ROLE_SLUG_MAX);
  const combined = `${company}-${role || "role"}`.slice(
    0,
    STARTUP_ROLE_SLUG_MAX,
  );
  return combined.replace(/-+$/g, "") || "role";
}

export function allocateStartupRoleSlug(
  startupSlug: string,
  title: string,
  taken: Iterable<string> = [],
): string {
  const reserved = new Set<string>();
  for (const value of taken) {
    const slug = parseStartupSlug(value);
    if (slug) reserved.add(slug);
  }
  const base = startupRoleSlugFromTitle(startupSlug, title);
  if (!reserved.has(base) && parseStartupSlug(base)) return base;
  let n = 2;
  while (reserved.has(`${base.slice(0, STARTUP_ROLE_SLUG_MAX - 3)}-${n}`)) {
    n += 1;
  }
  const suffix = `-${n}`;
  return `${base.slice(0, STARTUP_ROLE_SLUG_MAX - suffix.length)}${suffix}`;
}

export function parseStartupJobsSort(
  value: string | null | undefined,
): StartupJobsSort {
  const text = presentText(value);
  return text && (STARTUP_JOBS_SORTS as readonly string[]).includes(text)
    ? (text as StartupJobsSort)
    : STARTUP_JOBS_DEFAULT_SORT;
}

function parseJobsFacet(value: string | null | undefined, max: number): string {
  const text = presentText(value) ?? "";
  if (!text || text.toLowerCase() === "all" || text.length > max) return "";
  return text;
}

export function parseStartupJobsQuery(raw: {
  company?: string | string[];
  q?: string | string[];
  location?: string | string[];
  workType?: string | string[];
  sort?: string | string[];
  page?: string | string[] | number;
}): StartupJobsQuery {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const pageRaw = raw.page;
  const page =
    typeof pageRaw === "number"
      ? pageRaw >= 1 && Number.isFinite(pageRaw)
        ? Math.floor(pageRaw)
        : 1
      : Math.max(1, Number.parseInt(first(pageRaw) ?? "1", 10) || 1);
  return {
    company: parseStartupSlug(first(raw.company)) ?? "",
    q: presentText(first(raw.q)) ?? "",
    location: parseJobsFacet(first(raw.location), 240),
    // Old links carry raw board text ("FullTime"); fold it to the canonical id.
    workType: startupWorkTypeOf(parseJobsFacet(first(raw.workType), 80)) ?? "",
    sort: parseStartupJobsSort(first(raw.sort)),
    page,
  };
}

/** A follow needs at least one filter. The full catalog is not a saved search. */
export function startupJobsFollowFromQuery(
  query: StartupJobsQuery,
): StartupJobsFollow | null {
  const follow: StartupJobsFollow = {
    company: query.company,
    q: query.q.trim().toLowerCase().slice(0, STARTUP_JOBS_FOLLOW_Q_MAX),
    location: query.location,
    workType: query.workType,
  };
  if (!follow.company && !follow.q && !follow.location && !follow.workType) {
    return null;
  }
  return follow;
}

/** Longest search term kept; longer input is noise, not a word. */
const STARTUP_ROLE_SEARCH_TERM_MAX = 64;

/** More terms than this only narrow an already-empty result. */
const STARTUP_ROLE_SEARCH_TERMS_MAX = 8;

/**
 * Words of a jobs search, lowercased. Only letters and digits survive, so a
 * term can never carry tsquery syntax (`&`, `|`, `!`, `:`, parentheses).
 */
export function startupRoleSearchTerms(q: string): string[] {
  const terms: string[] = [];
  for (const match of q.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const term = match[0].slice(0, STARTUP_ROLE_SEARCH_TERM_MAX);
    if (!terms.includes(term)) terms.push(term);
    if (terms.length === STARTUP_ROLE_SEARCH_TERMS_MAX) break;
  }
  return terms;
}

/**
 * Shorter words match only as whole words: as prefixes, "c" or "go" would
 * match most of the catalog.
 */
export const STARTUP_ROLE_SEARCH_PREFIX_MIN = 3;

export type StartupRoleSearchTerm = { term: string; prefix: boolean };

/**
 * How each word of a jobs search matches: every word must match, and a word
 * long enough also matches as a prefix, so results follow the user while
 * they type ("engin" finds "engineering").
 */
export function startupRoleSearchPlan(q: string): StartupRoleSearchTerm[] {
  return startupRoleSearchTerms(q).map((term) => ({
    term,
    prefix: term.length >= STARTUP_ROLE_SEARCH_PREFIX_MIN,
  }));
}

function jobsSortKey(role: StartupRoleListing, sort: StartupJobsSort): string {
  if (sort === "company") return role.startupName;
  if (sort === "location") return role.location ?? "";
  return role.title;
}

/**
 * Filters and sorts roles for the jobs list. Text search is not done here:
 * `textMatches` is the full-text index's answer for `query.q` (see
 * `matchPublicStartupRoleIds`), and this function only intersects with it.
 */
export function applyStartupJobsQuery<R extends StartupRoleListing>(
  roles: readonly R[],
  query: StartupJobsQuery,
  textMatches: StartupRoleTextMatches,
): R[] {
  const company = query.company;
  const location = query.location.toLowerCase().replace(/\s+/g, " ");
  const workType = startupWorkTypeOf(query.workType);
  const searching = startupRoleSearchTerms(query.q).length > 0;
  if (searching && !textMatches) {
    throw new Error("A jobs search needs the full-text index matches.");
  }
  const matches = searching ? textMatches : null;
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return roles
    .filter((role) => {
      if (company && role.startupSlug !== company) return false;
      if (location === STARTUP_JOBS_REMOTE) {
        if (!isRemoteFriendlyRole(role)) return false;
      } else if (
        location &&
        (role.location ?? "").toLowerCase().replace(/\s+/g, " ") !== location
      ) {
        return false;
      }
      if (workType && startupWorkTypeOf(role.workType) !== workType) {
        return false;
      }
      return !matches || matches.has(role.id);
    })
    .sort((a, b) => {
      if (query.sort === "location") {
        if (!a.location && b.location) return 1;
        if (a.location && !b.location) return -1;
      }
      const byKey = collator.compare(
        jobsSortKey(a, query.sort),
        jobsSortKey(b, query.sort),
      );
      if (byKey !== 0) return byKey;
      return collator.compare(a.title, b.title);
    });
}

/**
 * Roles matching a saved search that first appeared in this directory after
 * `lastSeenAt`. No employer publish date is invented; roles without `listedAt`
 * stay out of the set.
 */
export function rolesListedSince<R extends StartupRoleListing>(
  roles: readonly R[],
  query: StartupJobsQuery,
  textMatches: StartupRoleTextMatches,
  lastSeenAt: string,
): R[] {
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return [];
  return applyStartupJobsQuery(roles, { ...query, page: 1 }, textMatches)
    .filter((role) => {
      const listed = Date.parse(role.listedAt ?? "");
      return Number.isFinite(listed) && listed > seen;
    })
    .sort(
      (a, b) => Date.parse(b.listedAt ?? "") - Date.parse(a.listedAt ?? ""),
    );
}

export function paginateStartupRoles<R extends StartupRoleListing>(
  roles: readonly R[],
  page: number,
  pageSize: number = STARTUPS_PAGE_SIZE,
): {
  items: R[];
  page: number;
  totalPages: number;
  total: number;
} {
  const total = roles.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: roles.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
  };
}

export function startupRoleSitemapPaths(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const raw of slugs) {
    const slug = parseStartupSlug(raw);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    paths.push(`${STARTUPS_JOBS_PATH}/${slug}`);
  }
  return paths;
}

const NON_PLACE =
  /^(?:remote|hybrid|worldwide|global|distributed|online|onsite|on-site|in[- ]office)$/i;

const STREET_PART =
  /\b(?:street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|way|suite|ste|floor|fl)\b/i;

const POSTAL_CODE_PART = /^(?:\d{5}(?:-\d{4})?|[A-Z]\d[A-Z]\s?\d[A-Z]\d)$/i;

const US_STATE_CODES = new Set([
  "al",
  "ak",
  "az",
  "ar",
  "ca",
  "co",
  "ct",
  "de",
  "dc",
  "fl",
  "ga",
  "hi",
  "id",
  "il",
  "in",
  "ia",
  "ks",
  "ky",
  "la",
  "me",
  "md",
  "ma",
  "mi",
  "mn",
  "ms",
  "mo",
  "mt",
  "ne",
  "nv",
  "nh",
  "nj",
  "nm",
  "ny",
  "nc",
  "nd",
  "oh",
  "ok",
  "or",
  "pa",
  "ri",
  "sc",
  "sd",
  "tn",
  "tx",
  "ut",
  "vt",
  "va",
  "wa",
  "wv",
  "wi",
  "wy",
]);

const CA_PROVINCE_CODES = new Set([
  "ab",
  "bc",
  "mb",
  "nb",
  "nl",
  "ns",
  "nt",
  "nu",
  "on",
  "pe",
  "qc",
  "sk",
  "yt",
]);

const REGION_NAMES = new Set([
  "alabama",
  "alaska",
  "arizona",
  "arkansas",
  "california",
  "colorado",
  "connecticut",
  "delaware",
  "florida",
  "georgia",
  "hawaii",
  "idaho",
  "illinois",
  "indiana",
  "iowa",
  "kansas",
  "kentucky",
  "louisiana",
  "maine",
  "maryland",
  "massachusetts",
  "michigan",
  "minnesota",
  "mississippi",
  "missouri",
  "montana",
  "nebraska",
  "nevada",
  "new hampshire",
  "new jersey",
  "new mexico",
  "new york",
  "north carolina",
  "north dakota",
  "ohio",
  "oklahoma",
  "oregon",
  "pennsylvania",
  "rhode island",
  "south carolina",
  "south dakota",
  "tennessee",
  "texas",
  "utah",
  "vermont",
  "virginia",
  "washington",
  "west virginia",
  "wisconsin",
  "wyoming",
  "district of columbia",
  "ontario",
  "quebec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "newfoundland",
  "prince edward island",
  "england",
  "scotland",
  "wales",
  "northern ireland",
]);

const COUNTRY_NAMES = new Set([
  "usa",
  "us",
  "united states",
  "united states of america",
  "canada",
  "uk",
  "united kingdom",
  "great britain",
  "france",
  "germany",
  "netherlands",
  "the netherlands",
  "israel",
  "india",
  "ireland",
  "australia",
  "switzerland",
  "sweden",
  "spain",
  "italy",
  "japan",
  "south korea",
  "korea",
  "brazil",
  "mexico",
  "singapore",
  "china",
  "taiwan",
  "hong kong",
  "new zealand",
  "belgium",
  "austria",
  "poland",
  "portugal",
  "norway",
  "denmark",
  "finland",
  "estonia",
  "greece",
  "turkey",
  "uae",
  "united arab emirates",
  "luxembourg",
  "czech republic",
  "czechia",
  "romania",
  "ukraine",
  "argentina",
  "chile",
  "south africa",
  "nigeria",
  "kenya",
  "indonesia",
  "vietnam",
  "thailand",
  "philippines",
  "malaysia",
  "saudi arabia",
  "qatar",
  "egypt",
  "colombia",
  "peru",
  "iceland",
  "hungary",
  "lithuania",
  "latvia",
]);

/** ISO country codes that are not also a US state or Canadian province. */
const COUNTRY_CODES = new Set([
  "us",
  "gb",
  "uk",
  "fr",
  "nl",
  "ie",
  "au",
  "ch",
  "se",
  "es",
  "it",
  "jp",
  "kr",
  "br",
  "mx",
  "sg",
  "cn",
  "tw",
  "hk",
  "nz",
  "be",
  "at",
  "pl",
  "pt",
  "no",
  "dk",
  "fi",
  "ee",
  "gr",
  "tr",
  "ae",
  "lu",
  "cz",
  "ro",
  "ua",
  "cl",
  "za",
  "ng",
  "ke",
  "vn",
  "th",
  "ph",
  "my",
  "sa",
  "qa",
  "eg",
  "pe",
  "is",
  "hu",
  "lt",
  "lv",
]);

function placeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\./g, "");
}

function isRegionCode(value: string): boolean {
  const key = placeKey(value);
  return US_STATE_CODES.has(key) || CA_PROVINCE_CODES.has(key);
}

function countryToken(value: string): string | null {
  const trimmed = value.trim();
  const key = placeKey(trimmed);
  if (COUNTRY_NAMES.has(key)) return trimmed;
  if (key.length === 2 && COUNTRY_CODES.has(key) && !isRegionCode(trimmed)) {
    return trimmed;
  }
  return null;
}

function regionToken(value: string): string | null {
  const trimmed = value.trim();
  const key = placeKey(trimmed);
  if (isRegionCode(trimmed) || REGION_NAMES.has(key)) return trimmed;
  return null;
}

function isStreetPart(value: string): boolean {
  return /\d/.test(value) && STREET_PART.test(value);
}

/**
 * YYYY-MM-DD from an ATS / careers-board publish timestamp.
 * Soft-omits missing, non-ISO, and impossible calendar dates.
 * Does not read crawl time, fetchedAt, or the current clock.
 */
export function sourcedIsoDate(
  value: string | null | undefined,
): string | null {
  const text = presentText(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function postalAddressFromSegment(
  segment: string,
): Record<string, string> | null {
  const parts = segment
    .split(",")
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > 0 &&
        !NON_PLACE.test(part) &&
        !isStreetPart(part) &&
        !POSTAL_CODE_PART.test(part),
    );
  if (parts.length === 0) return null;

  const address: Record<string, string> = { "@type": "PostalAddress" };
  let rest = parts;
  const country = countryToken(parts.at(-1) ?? "");
  if (country) {
    address.addressCountry = country;
    rest = parts.slice(0, -1);
  }
  if (rest.length === 0) return address;
  if (rest.length === 1) {
    const only = rest[0] ?? "";
    const region = regionToken(only);
    if (region) address.addressRegion = region;
    else address.addressLocality = only;
    return address;
  }
  address.addressLocality = rest[0] ?? "";
  const regionSource = rest.at(-1) ?? "";
  address.addressRegion = regionToken(regionSource) ?? regionSource;
  return address;
}

function jobLocationFromPlace(
  value: string | null | undefined,
): Record<string, unknown> | Record<string, unknown>[] | null {
  const text = presentText(value);
  if (!text) return null;
  const places = text
    .split(/\s*[|;]\s*/)
    .map((part) =>
      part
        .replace(
          /\s*\((?:remote|hybrid|onsite|on-site|in[- ]office)\)\s*/gi,
          " ",
        )
        .trim(),
    )
    .filter((part) => part.length > 0 && !NON_PLACE.test(part))
    .flatMap((segment) => {
      const address = postalAddressFromSegment(segment);
      return address ? [{ "@type": "Place", address }] : [];
    });
  if (places.length === 0) return null;
  if (places.length === 1) return places[0] ?? null;
  return places;
}

export function startupRoleJsonLd(
  role: StartupRolePublic,
): Record<string, unknown> | null {
  const datePosted = sourcedIsoDate(role.postedAt);
  if (!datePosted) return null;
  const title = cleanStartupRoleTitle(role.title) ?? role.title;
  const description = sanitizeStartupRoleDescription(role.descriptionText);
  const item: Record<string, unknown> = {
    "@type": "JobPosting",
    title,
    url: role.sourceUrl,
    datePosted,
    hiringOrganization: {
      "@type": "Organization",
      name: role.startupName,
    },
  };
  if (description) item.description = description;
  const jobLocation = jobLocationFromPlace(role.location);
  if (jobLocation) item.jobLocation = jobLocation;
  return item;
}
