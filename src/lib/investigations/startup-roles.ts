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

export type ExtractedJobListing = {
  title: string;
  sourceUrl: string;
  applyUrl: string | null;
  location: string | null;
  workType: string | null;
  descriptionText: string | null;
  externalId: string | null;
  board: StartupRoleBoard;
};

export const STARTUP_JOBS_SORTS = ["role", "company", "location"] as const;

export type StartupJobsSort = (typeof STARTUP_JOBS_SORTS)[number];

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
    : "role";
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
    workType: parseJobsFacet(first(raw.workType), 80),
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

function jobsSortKey(role: StartupRolePublic, sort: StartupJobsSort): string {
  if (sort === "company") return role.startupName;
  if (sort === "location") return role.location ?? "";
  return role.title;
}

export function applyStartupJobsQuery(
  roles: readonly StartupRolePublic[],
  query: StartupJobsQuery,
): StartupRolePublic[] {
  const company = query.company;
  const location = query.location.toLowerCase();
  const workType = query.workType.toLowerCase();
  const needle = query.q.trim().toLowerCase();
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return roles
    .filter((role) => {
      if (company && role.startupSlug !== company) return false;
      if (location && (role.location ?? "").toLowerCase() !== location) {
        return false;
      }
      if (workType && (role.workType ?? "").toLowerCase() !== workType) {
        return false;
      }
      if (!needle) return true;
      const haystack = [
        role.title,
        role.startupName,
        role.location ?? "",
        role.workType ?? "",
      ]
        .join("\n")
        .toLowerCase();
      return haystack.includes(needle);
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
export function rolesListedSince(
  roles: readonly StartupRolePublic[],
  query: StartupJobsQuery,
  lastSeenAt: string,
): StartupRolePublic[] {
  const seen = Date.parse(lastSeenAt);
  if (!Number.isFinite(seen)) return [];
  return applyStartupJobsQuery(roles, { ...query, page: 1 })
    .filter((role) => {
      const listed = Date.parse(role.listedAt ?? "");
      return Number.isFinite(listed) && listed > seen;
    })
    .sort(
      (a, b) => Date.parse(b.listedAt ?? "") - Date.parse(a.listedAt ?? ""),
    );
}

export function paginateStartupRoles(
  roles: readonly StartupRolePublic[],
  page: number,
  pageSize: number = STARTUPS_PAGE_SIZE,
): {
  items: StartupRolePublic[];
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

export function startupRoleJsonLd(
  role: StartupRolePublic,
): Record<string, unknown> {
  const title = cleanStartupRoleTitle(role.title) ?? role.title;
  const description = sanitizeStartupRoleDescription(role.descriptionText);
  const item: Record<string, unknown> = {
    "@type": "JobPosting",
    title,
    url: role.sourceUrl,
    hiringOrganization: {
      "@type": "Organization",
      name: role.startupName,
    },
  };
  if (description) item.description = description;
  if (role.location) {
    item.jobLocation = {
      "@type": "Place",
      address: role.location,
    };
  }
  const datePosted = boardSourcedDatePosted(role.postedAt);
  if (datePosted) item.datePosted = datePosted;
  return item;
}

/** YYYY-MM-DD from a board-sourced timestamp. Soft-omit when missing or invalid. */
function boardSourcedDatePosted(
  value: string | null | undefined,
): string | null {
  const text = presentText(value);
  if (!text) return null;
  return /^(\d{4}-\d{2}-\d{2})/.exec(text)?.[1] ?? null;
}
