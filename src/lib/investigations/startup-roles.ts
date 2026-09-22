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
  sort: StartupJobsSort;
  page: number;
};

export function parseStartupRoleTitle(
  value: string | null | undefined,
): string | null {
  const title = presentText(value);
  if (!title || title.length > STARTUP_ROLE_TITLE_MAX) return null;
  return title;
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
  const text = presentText(value);
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

export function parseStartupJobsQuery(raw: {
  company?: string | string[];
  q?: string | string[];
  location?: string | string[];
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
  const location = presentText(first(raw.location)) ?? "";
  return {
    company: parseStartupSlug(first(raw.company)) ?? "",
    q: presentText(first(raw.q)) ?? "",
    location:
      !location || location.toLowerCase() === "all" || location.length > 240
        ? ""
        : location,
    sort: parseStartupJobsSort(first(raw.sort)),
    page,
  };
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
  const needle = query.q.trim().toLowerCase();
  const collator = new Intl.Collator(undefined, { sensitivity: "base" });
  return roles
    .filter((role) => {
      if (company && role.startupSlug !== company) return false;
      if (location && (role.location ?? "").toLowerCase() !== location) {
        return false;
      }
      if (!needle) return true;
      const haystack = [role.title, role.startupName, role.location ?? ""]
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
  const item: Record<string, unknown> = {
    "@type": "JobPosting",
    title: role.title,
    url: role.sourceUrl,
    hiringOrganization: {
      "@type": "Organization",
      name: role.startupName,
    },
  };
  if (role.descriptionText) item.description = role.descriptionText;
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
