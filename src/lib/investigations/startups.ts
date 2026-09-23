import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { slugify } from "@/lib/text-utils";
import {
  sourcedStartupPlaceLabel,
  startupPlaceCentroid,
} from "./startups-places";

export const STARTUPS_PATH = "/startups";

export const STARTUPS_INSIGHTS_PATH = "/startups/insights";

export const STARTUPS_JOBS_PATH = "/jobs";

/** Pre-IA investigation URLs. Permanent-redirect in next.config. */
export const STARTUPS_LEGACY_PATH = "/investigations/startups";

/** Static segments — never a company profile slug. */
export const STARTUPS_RESERVED_SLUGS = new Set(["insights", "jobs"]);

export const STARTUPS_SLUG_MAX = 80;

export const STARTUPS_SLUG_FALLBACK = "startup";

export const STARTUPS_SLUG_ERROR =
  "Use a unique lowercase slug (letters, numbers, hyphens).";

export const STARTUPS_H1 = "AI startups worth watching";

export const STARTUPS_META =
  "Companies that materially enable AI — models, agents, AI infra, robotics, energy, and verticals. Homepage and sources verified. Not a size or price scorecard.";

export const STARTUPS_INSIGHTS_H1 = "AI startups insights";

export const STARTUPS_INSIGHTS_META =
  "Added over time, plus category, region, stage, and source coverage — from the live directory only. Blank stage stays omitted. Region mix waits until five distinct sourced regions are listed.";

export const STARTUPS_JOIN_HREF =
  "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=startups&utm_campaign=startups";

/** Role-page guests only. Hard /en/join with a jobs campaign. Not the jobs index. */
export const JOBS_ROLE_JOIN_HREF =
  "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=jobs&utm_campaign=jobs";

export const STARTUPS_HOMEPAGE_ERROR = "Use a live http(s) homepage URL.";

export const STARTUPS_SOURCES_ERROR =
  "Add 1–3 source URLs (homepage 200 plus cited pages).";

export const STARTUPS_CATEGORY_ERROR =
  "Use a listed category: models, agents, AI infra, robotics, energy, vertical, or other.";

export const STARTUPS_DUPLICATE_ERROR =
  "That homepage is already submitted or listed.";

export const STARTUPS_BATCH_MAX = 30;

export const STARTUPS_PAGE_SIZE = 24;

export const STARTUPS_NAME_MAX = 160;

/** Sourced short blurb. Longer than logo URLs; still a directory one-liner. */
export const STARTUPS_DESCRIPTION_MAX = 500;

export type StartupLocale = "en" | "nl";

export type StartupCategoryId =
  | "models"
  | "agents"
  | "ai-infra"
  | "robotics"
  | "energy"
  | "vertical"
  | "other";

export type StartupStatus = "pending" | "approved" | "rejected";

export type StartupSourceKind = "staff";

export type StartupExitStatus = "acquired" | "ipo" | "shutdown";

export type StartupFounder = {
  name: string;
  url: string | null;
  /** Sourced photo only. Soft-omit — never invent a face or stock image. */
  imageUrl: string | null;
};

/** Promo-only lock (LinkedIn / newsletter / Hub push). Not a crawl gate. */
export const STARTUPS_PUBLIC_INDEX_MIN = 3000;

export const STARTUPS_FOUNDERS_SHOWN = 3;

export type StartupPublicCard = {
  id: string;
  name: string;
  homepage: string;
  category: StartupCategoryId;
  sources: string[];
  region: string | null;
  lat: number | null;
  lng: number | null;
  stage: string | null;
  logoUrl: string | null;
  /** Sourced short blurb only. Soft-omit blank — never invent copy. */
  description: string | null;
  founders: StartupFounder[];
  exitStatus: StartupExitStatus | null;
  acquirer: string | null;
  exitOn: string | null;
  jobsUrl: string | null;
  listedOn: string;
  /** Stable unique public path segment. Never invent a marketing handle. */
  slug: string;
  /** Count of sourced `open` roles. 0 until a scan has published any. */
  openRoleCount: number;
};

export function startupHasOpenJobs(
  card: Pick<StartupPublicCard, "openRoleCount">,
): boolean {
  return card.openRoleCount > 0;
}

export const STARTUP_EXIT_STATUS_IDS = [
  "acquired",
  "ipo",
  "shutdown",
] as const satisfies readonly StartupExitStatus[];

export const STARTUP_EXIT_STATUS_LABELS: Record<
  StartupExitStatus,
  Record<StartupLocale, string>
> = {
  acquired: { en: "Acquired", nl: "Overgenomen" },
  ipo: { en: "IPO", nl: "Beursgang" },
  shutdown: { en: "Shutdown", nl: "Gestopt" },
};

/** Filter labels only. Blank exit stays badge-omitted on the card. */
export const STARTUP_EXIT_FILTER_LABELS: Record<
  StartupExitFilter,
  Record<StartupLocale, string>
> = {
  active: { en: "Active", nl: "Actief" },
  ...STARTUP_EXIT_STATUS_LABELS,
};

export const STARTUPS_FOUNDERS_MAX = 8;

export const STARTUPS_EXIT_ERROR =
  "Use a sourced exit only: acquired, IPO, or shutdown.";

export const STARTUPS_JOBS_URL_ERROR =
  "Use a live http(s) careers URL (Ops-confirmed 200) or leave blank.";

export type StartupSort = "newest" | "name" | "category";

export type StartupExitFilter = "active" | StartupExitStatus;

export type StartupHiringFilter = "all" | "hiring";

export type StartupDirectoryFilters = {
  q: string;
  category: StartupCategoryId | "all";
  region?: string;
  stage?: string;
  status?: StartupExitFilter | "all";
  hiring?: StartupHiringFilter;
  sort?: StartupSort;
};

export type StartupDirectoryQuery = StartupDirectoryFilters & {
  page: number;
};

export const STARTUP_SORT_IDS = [
  "newest",
  "name",
  "category",
] as const satisfies readonly StartupSort[];

export const STARTUP_EXIT_FILTER_IDS = [
  "active",
  "acquired",
  "ipo",
  "shutdown",
] as const satisfies readonly StartupExitFilter[];

export type StartupMapPin = {
  id: string;
  name: string;
  homepage: string;
  slug: string;
  lat: number;
  lng: number;
  /** Sourced city/region string only — never a fabricated street address. */
  region: string | null;
};

export const STARTUP_CATEGORY_IDS = [
  "models",
  "agents",
  "ai-infra",
  "robotics",
  "energy",
  "vertical",
  "other",
] as const satisfies readonly StartupCategoryId[];

export const STARTUP_CATEGORY_LABELS: Record<
  StartupCategoryId,
  Record<StartupLocale, string>
> = {
  models: { en: "Models", nl: "Modellen" },
  agents: { en: "Agents", nl: "Agents" },
  "ai-infra": { en: "AI infra", nl: "AI-infra" },
  robotics: { en: "Robotics", nl: "Robotica" },
  energy: { en: "Energy", nl: "Energie" },
  vertical: { en: "Vertical", nl: "Verticaal" },
  other: { en: "Other", nl: "Overig" },
};

const CATEGORY_ALIASES: Record<string, StartupCategoryId> = {
  models: "models",
  agents: "agents",
  "ai-infra": "ai-infra",
  ai_infra: "ai-infra",
  "ai infra": "ai-infra",
  robotics: "robotics",
  energy: "energy",
  vertical: "vertical",
  other: "other",
};

export function presentText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function buildStartupProfilePath(slug: string): string {
  return `${STARTUPS_PATH}/${slug}`;
}

export function buildStartupRolePath(slug: string): string {
  return `${STARTUPS_JOBS_PATH}/${slug}`;
}

export function buildStartupJobsPath(query?: {
  company?: string | null;
  q?: string | null;
  location?: string | null;
  workType?: string | null;
  sort?: string | null;
  page?: number;
}): string {
  const params = new URLSearchParams();
  const company = parseStartupSlug(query?.company ?? null);
  const needle = presentText(query?.q);
  const location = presentText(query?.location);
  const workType = presentText(query?.workType);
  const sort = presentText(query?.sort);
  if (company) params.set("company", company);
  if (needle) params.set("q", needle);
  if (location && location.toLowerCase() !== "all") {
    params.set("location", location);
  }
  if (workType && workType.toLowerCase() !== "all") {
    params.set("workType", workType);
  }
  if (sort && sort !== "role") params.set("sort", sort);
  if (query?.page && query.page > 1) params.set("page", String(query.page));
  const suffix = params.toString();
  return suffix ? `${STARTUPS_JOBS_PATH}?${suffix}` : STARTUPS_JOBS_PATH;
}

export function startupSlugFromName(name: string): string {
  const slug = slugify(name).slice(0, STARTUPS_SLUG_MAX);
  return slug || STARTUPS_SLUG_FALLBACK;
}

export function parseStartupSlug(
  value: string | null | undefined,
): string | null {
  const raw = presentText(value)?.toLowerCase() ?? "";
  if (!raw || raw.length > STARTUPS_SLUG_MAX) return null;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(raw) ? raw : null;
}

export function isReservedStartupSlug(slug: string): boolean {
  return STARTUPS_RESERVED_SLUGS.has(slug);
}

export function allocateStartupSlug(
  name: string,
  taken: Iterable<string> = [],
  preferred?: string | null,
): string {
  const reserved = new Set<string>(STARTUPS_RESERVED_SLUGS);
  for (const value of taken) {
    const slug = parseStartupSlug(value);
    if (slug) reserved.add(slug);
  }
  const base = parseStartupSlug(preferred) ?? startupSlugFromName(name);
  if (!reserved.has(base)) return base;
  let n = 2;
  while (reserved.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export type StartupOverviewTile =
  | "logo"
  | "blurb"
  | "category"
  | "region"
  | "stage"
  | "exit"
  | "founders"
  | "jobs"
  | "sources"
  | "map";

export type StartupProfileExtraTab = "news" | "hiring" | "funding" | "team";

export function startupNewsSources(
  sources: readonly string[] | null | undefined,
): string[] {
  return displayStartupSources(sources).filter(
    (href) => startupCiteKind(href) === "news",
  );
}

export function startupOverviewTiles(
  card: StartupPublicCard,
): StartupOverviewTile[] {
  const tiles: StartupOverviewTile[] = [];
  if (displayStartupLogoUrl(card.logoUrl)) tiles.push("logo");
  if (sanitizeStartupDescription(card.description)) tiles.push("blurb");
  tiles.push("category");
  if (presentText(card.region)) tiles.push("region");
  if (presentText(card.stage)) tiles.push("stage");
  if (card.exitStatus) tiles.push("exit");
  if (displayStartupFounders(card.founders).length > 0) tiles.push("founders");
  if (startupHasOpenJobs(card)) tiles.push("jobs");
  if (displayStartupSources(card.sources).length > 0) tiles.push("sources");
  if (verifiedStartupPin(card)) tiles.push("map");
  return tiles;
}

export function startupProfileExtraTabs(
  card: StartupPublicCard,
): StartupProfileExtraTab[] {
  const tabs: StartupProfileExtraTab[] = [];
  if (startupNewsSources(card.sources).length > 0) tabs.push("news");
  if (startupHasOpenJobs(card)) tabs.push("hiring");
  if (card.exitStatus) tabs.push("funding");
  if (displayStartupFounders(card.founders).length > 0) tabs.push("team");
  return tabs;
}

export function startupProfileSitemapPaths(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const raw of slugs) {
    const slug = parseStartupSlug(raw);
    if (!slug || seen.has(slug) || isReservedStartupSlug(slug)) continue;
    seen.add(slug);
    paths.push(buildStartupProfilePath(slug));
  }
  return paths;
}

export function startupProfileJsonLd(
  card: StartupPublicCard,
): Record<string, unknown> {
  const item: Record<string, unknown> = {
    "@type": "Organization",
    name: card.name,
    url: card.homepage,
  };
  const description = sanitizeStartupDescription(card.description);
  if (description) item.description = description;
  const logo = displayStartupLogoUrl(card.logoUrl);
  if (logo) item.logo = logo;
  const sources = displayStartupSources(card.sources);
  if (sources.length > 0) item.sameAs = sources;
  return item;
}

export function startupProfileMetaDescription(
  card: StartupPublicCard,
  locale: StartupLocale,
): string | undefined {
  const blurb = sanitizeStartupDescription(card.description);
  if (blurb) return blurb;
  const parts = [
    STARTUP_CATEGORY_LABELS[card.category][locale],
    presentText(card.region),
    presentText(card.stage),
  ].filter((value): value is string => value != null);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Sourced blurb only. Blank / whitespace stays omitted — never invent copy. */
export function sanitizeStartupDescription(
  value: string | null | undefined,
): string | null {
  const trimmed = presentText(value);
  if (!trimmed) return null;
  return trimmed.length <= STARTUPS_DESCRIPTION_MAX
    ? trimmed
    : trimmed.slice(0, STARTUPS_DESCRIPTION_MAX);
}

/**
 * Verified logo URL only. Soft-omit blank, over-long, or non-http(s).
 * Never invent a mark or homepage favicon.
 */
export function displayStartupLogoUrl(
  value: string | null | undefined,
): string | null {
  const raw = presentText(value);
  if (!raw || raw.length > 240) return null;
  return normalizeStartupHomepage(raw);
}

export function parseStartupCategory(
  value: string | null | undefined,
): StartupCategoryId | null {
  if (value == null) return null;
  return CATEGORY_ALIASES[value.trim().toLowerCase()] ?? null;
}

export function isStartupCategoryId(
  value: string | null | undefined,
): value is StartupCategoryId {
  return parseStartupCategory(value) != null;
}

export function normalizeStartupHomepage(href: string): string | null {
  try {
    const url = new URL(href.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    url.hash = "";
    const path =
      url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : "";
    return `${url.protocol}//${url.host}${path}${url.search}`;
  } catch {
    return null;
  }
}

export function sanitizeStartupSources(
  sources: readonly string[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const raw of sources ?? []) {
    const href = normalizeStartupHomepage(raw);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    clean.push(href);
    if (clean.length === 3) break;
  }
  return clean;
}

export function displayStartupSources(
  sources: readonly string[] | null | undefined,
): string[] {
  const clean = sanitizeStartupSources(sources);
  return clean.length >= 1 && clean.length <= 3 ? clean : [];
}

export function parseStartupExitStatus(
  value: string | null | undefined,
): StartupExitStatus | null {
  if (value == null) return null;
  const raw = value.trim().toLowerCase();
  if (raw === "acquired" || raw === "ipo" || raw === "shutdown") return raw;
  return null;
}

export function isStartupExitStatus(
  value: string | null | undefined,
): value is StartupExitStatus {
  return parseStartupExitStatus(value) != null;
}

export function parseStartupExitOn(
  value: string | number | null | undefined,
): string | null {
  const trimmed = value == null ? "" : String(value).trim();
  if (!trimmed) return null;
  if (/^\d{4}$/.test(trimmed)) return trimmed;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export type PulseStartupRow = {
  name: string;
  homepage: string;
  category: string;
  sources: readonly string[];
  region?: string | null;
  stage?: string | null;
  logo_url?: string | null;
  logoUrl?: string | null;
  founders?:
    | readonly {
        name?: string | null;
        url?: string | null;
        imageUrl?: string | null;
        image_url?: string | null;
        photo_url?: string | null;
      }[]
    | null;
  status?: string | null;
  exitStatus?: string | null;
  exit_acquirer?: string | null;
  acquirer?: string | null;
  exit_year?: string | number | null;
  exitOn?: string | number | null;
  jobs_url?: string | null;
  jobsUrl?: string | null;
  description?: string | null;
  blurb?: string | null;
  slug?: string | null;
};

/** Pulse `status` is the sourced exit, not listing pending|approved|rejected. */
export function pulseExitAlias(
  value: string | null | undefined,
): StartupExitStatus | null {
  return parseStartupExitStatus(value);
}

export function mapPulseStartupWrite(row: PulseStartupRow) {
  const exitStatus =
    parseStartupExitStatus(row.exitStatus) ?? pulseExitAlias(row.status);
  const logoRaw = presentText(row.logoUrl) ?? presentText(row.logo_url);
  const jobsRaw = presentText(row.jobsUrl) ?? presentText(row.jobs_url);
  return {
    name: row.name,
    homepage: normalizeStartupHomepage(row.homepage),
    category: parseStartupCategory(row.category),
    sources: sanitizeStartupSources(row.sources),
    region: presentText(row.region),
    stage: presentText(row.stage),
    logoUrl: logoRaw ? normalizeStartupHomepage(logoRaw) : null,
    description: sanitizeStartupDescription(
      presentText(row.description) ?? presentText(row.blurb),
    ),
    founders: sanitizeStartupFounders(row.founders),
    exitStatus,
    acquirer: exitStatus
      ? (presentText(row.acquirer) ?? presentText(row.exit_acquirer))
      : null,
    exitOn: exitStatus ? parseStartupExitOn(row.exitOn ?? row.exit_year) : null,
    jobsUrl: jobsRaw ? normalizeStartupHomepage(jobsRaw) : null,
    slug: parseStartupSlug(row.slug),
  };
}

export type StartupFounderInput = {
  name?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
};

export function sanitizeStartupFounders(
  founders: readonly StartupFounderInput[] | null | undefined,
): StartupFounder[] {
  const clean: StartupFounder[] = [];
  for (const raw of founders ?? []) {
    const name = presentText(raw?.name);
    if (!name) continue;
    const url = raw?.url ? normalizeStartupHomepage(raw.url) : null;
    const imageRaw =
      presentText(raw?.imageUrl) ??
      presentText(raw?.image_url) ??
      presentText(raw?.photo_url);
    const imageUrl = imageRaw ? normalizeStartupHomepage(imageRaw) : null;
    clean.push({ name, url, imageUrl });
    if (clean.length === STARTUPS_FOUNDERS_MAX) break;
  }
  return clean;
}

export function displayStartupFounders(
  founders: readonly StartupFounderInput[] | null | undefined,
): StartupFounder[] {
  return sanitizeStartupFounders(founders);
}

export function startupFounderInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0]!.slice(0, 1).toUpperCase();
  }
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function formatStartupExitBadge(
  card: Pick<StartupPublicCard, "exitStatus" | "acquirer" | "exitOn">,
  locale: StartupLocale = "en",
): string | null {
  if (!card.exitStatus) return null;
  const parts = [STARTUP_EXIT_STATUS_LABELS[card.exitStatus][locale]];
  const acquirer = presentText(card.acquirer);
  const exitOn = presentText(card.exitOn);
  if (acquirer) parts.push(acquirer);
  if (exitOn) {
    const year = /^(\d{4})(?:-\d{2}-\d{2})?$/.exec(exitOn);
    parts.push(year ? year[1]! : exitOn);
  }
  return parts.join("·");
}

export type StartupCiteKind = "docs" | "deep-dive" | "talk" | "news";

export const STARTUP_CITE_KIND_IDS = [
  "docs",
  "deep-dive",
  "talk",
  "news",
] as const satisfies readonly StartupCiteKind[];

export const STARTUP_CITE_KIND_LABELS: Record<
  StartupCiteKind,
  Record<StartupLocale, string>
> = {
  docs: { en: "Docs", nl: "Docs" },
  "deep-dive": { en: "Deep dive", nl: "Deep dive" },
  talk: { en: "Talk", nl: "Talk" },
  news: { en: "News", nl: "Nieuws" },
};

const SOURCED_PUBLICATION_TITLES: Record<string, string> = {
  "techcrunch.com": "TechCrunch",
  "datacenterdynamics.com": "Data Center Dynamics",
};

/** Sourced article titles keyed by host + path. Never invent a headline. */
const SOURCED_ARTICLE_TITLES: Record<string, string> = {
  "cursor.com/blog/joining-spacex": "Cursor: Joining SpaceX",
};

function startupSourceHost(
  href: string,
): { host: string; path: string } | null {
  try {
    const url = new URL(href);
    return {
      host: url.hostname.replace(/^www\./, "").toLowerCase(),
      path: url.pathname.replace(/\/+$/, "").toLowerCase(),
    };
  } catch {
    return null;
  }
}

function isCursorJoiningSpacexSource(host: string, path: string): boolean {
  const cursorHost = host === "cursor.com" || host.endsWith(".cursor.com");
  return cursorHost && path === "/blog/joining-spacex";
}

/** TechAviv Unicorns share base — not every airtable.com URL. */
const TECHAVIV_AIRTABLE_APP = "appyexehrnzkmquvh";

function isTechAvivAirtableSource(host: string, path: string): boolean {
  const airtableHost =
    host === "airtable.com" || host.endsWith(".airtable.com");
  if (!airtableHost) return false;
  return (
    path === `/${TECHAVIV_AIRTABLE_APP}` ||
    path.startsWith(`/${TECHAVIV_AIRTABLE_APP}/`)
  );
}

/** Gigasheet Israel business sample — not every gigasheet.com URL. */
const GIGASHEET_ISRAEL_LIST_PATH = "/sample-data/free-israel-business-listcsv";

function isGigasheetIsraelListSource(host: string, path: string): boolean {
  const gigasheetHost =
    host === "gigasheet.com" || host.endsWith(".gigasheet.com");
  return gigasheetHost && path === GIGASHEET_ISRAEL_LIST_PATH;
}

/** Publication name from the host only — never an invented article title. */
export function sourcedStartupSourceTitle(href: string): string | null {
  const parsed = startupSourceHost(href);
  if (!parsed) return null;
  if (
    parsed.host === "wikipedia.org" ||
    parsed.host.endsWith(".wikipedia.org")
  ) {
    return "Wikipedia";
  }
  if (isCursorJoiningSpacexSource(parsed.host, parsed.path)) {
    return "Cursor: Joining SpaceX";
  }
  if (isTechAvivAirtableSource(parsed.host, parsed.path)) {
    return "TechAviv";
  }
  if (isGigasheetIsraelListSource(parsed.host, parsed.path)) {
    return "Gigasheet";
  }
  const article = SOURCED_ARTICLE_TITLES[`${parsed.host}${parsed.path}`];
  if (article) return article;
  return SOURCED_PUBLICATION_TITLES[parsed.host] ?? null;
}

export type StartupSourceChip = {
  href: string;
  label: string;
};

/** Unique visible labels only — never News/News. First sourced label wins. */
export function displayStartupSourceChips(
  sources: readonly string[] | null | undefined,
  locale: StartupLocale = "en",
): StartupSourceChip[] {
  const chips: StartupSourceChip[] = [];
  const seen = new Set<string>();
  for (const href of displayStartupSources(sources)) {
    const label = startupSourceLabel(href, locale);
    const key = label.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push({ href, label });
  }
  return chips;
}

export function startupCiteKind(href: string): StartupCiteKind {
  const parsed = startupSourceHost(href);
  if (!parsed) return "docs";
  const { host, path } = parsed;
  if (
    host === "youtube.com" ||
    host === "youtu.be" ||
    host === "vimeo.com" ||
    /\/(talks?|keynote|podcast|webinar|watch)(?:\/|$)/.test(path)
  ) {
    return "talk";
  }
  if (/\/(newsroom|news|press|press-releases|in-the-news)(?:\/|$)/.test(path)) {
    return "news";
  }
  if (/\/(blog|research|papers|analysis|post)(?:\/|$)/.test(path)) {
    return "deep-dive";
  }
  return "docs";
}

/**
 * Visible `<a>` label: sourced publication title when the host is known,
 * otherwise Docs · Deep dive · Talk · News. Never a bare 1/2/3.
 */
export function startupSourceLabel(
  href: string,
  locale: StartupLocale = "en",
): string {
  return (
    sourcedStartupSourceTitle(href) ??
    STARTUP_CITE_KIND_LABELS[startupCiteKind(href)][locale]
  );
}

function isUsableCoord(lat: number | null, lng: number | null): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Approximate pins: city/HQ coords if stored, else region centroid.
 * Unknown location → list only. Label is the sourced place string only.
 */
export function resolveStartupPinCoords(
  card: Pick<StartupPublicCard, "region" | "lat" | "lng">,
): { lat: number; lng: number } | null {
  if (isUsableCoord(card.lat, card.lng)) {
    return { lat: card.lat!, lng: card.lng! };
  }
  const centroid = startupPlaceCentroid(card.region);
  if (!centroid) return null;
  return { lat: centroid.lat, lng: centroid.lng };
}

export function verifiedStartupPin(
  card: Pick<
    StartupPublicCard,
    "id" | "name" | "homepage" | "slug" | "region" | "lat" | "lng"
  >,
): StartupMapPin | null {
  const coords = resolveStartupPinCoords(card);
  if (!coords) return null;
  return {
    id: card.id,
    name: card.name,
    homepage: card.homepage,
    slug: card.slug,
    lat: coords.lat,
    lng: coords.lng,
    region: sourcedStartupPlaceLabel(card.region),
  };
}

export function startupMapPins(
  cards: readonly StartupPublicCard[],
): StartupMapPin[] {
  return cards.flatMap((card) => {
    const pin = verifiedStartupPin(card);
    return pin ? [pin] : [];
  });
}

export function formatStartupListedDate(
  listedOn: string,
  locale: StartupLocale,
): string {
  const date = new Date(`${listedOn}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return listedOn;
  const formatted = new Intl.DateTimeFormat(
    locale === "nl" ? "nl-NL" : "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  ).format(date);
  return locale === "nl" ? `Geplaatst: ${formatted}` : `Listed: ${formatted}`;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseStartupPage(value: string | string[] | undefined): number {
  const raw = firstParam(value);
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

export function parseStartupSort(
  value: string | null | undefined,
): StartupSort {
  const raw = value?.trim().toLowerCase() ?? "";
  if (raw === "name" || raw === "a-z" || raw === "az") return "name";
  if (raw === "category") return "category";
  return "newest";
}

export function parseStartupExitFilter(
  value: string | null | undefined,
): StartupExitFilter | "all" {
  const raw = value?.trim().toLowerCase() ?? "";
  if (
    raw === "active" ||
    raw === "acquired" ||
    raw === "ipo" ||
    raw === "shutdown"
  ) {
    return raw;
  }
  return "all";
}

export function parseStartupHiringFilter(
  value: string | null | undefined,
): StartupHiringFilter {
  const raw = value?.trim().toLowerCase() ?? "";
  if (raw === "1" || raw === "yes" || raw === "true" || raw === "hiring") {
    return "hiring";
  }
  return "all";
}

export function startupExitBucket(
  card: Pick<StartupPublicCard, "exitStatus">,
): StartupExitFilter {
  return card.exitStatus ?? "active";
}

export function parseStartupDirectoryQuery(raw: {
  q?: string | string[];
  category?: string | string[];
  region?: string | string[];
  stage?: string | string[];
  status?: string | string[];
  exit?: string | string[];
  hiring?: string | string[];
  sort?: string | string[];
  page?: string | string[] | number;
}): StartupDirectoryQuery {
  const q = firstParam(raw.q)?.trim() ?? "";
  const category = parseStartupCategory(firstParam(raw.category)) ?? "all";
  const region = presentText(firstParam(raw.region)) ?? "all";
  const stage = presentText(firstParam(raw.stage)) ?? "all";
  const status = parseStartupExitFilter(
    firstParam(raw.status) ?? firstParam(raw.exit),
  );
  const hiring = parseStartupHiringFilter(firstParam(raw.hiring));
  const sort = parseStartupSort(firstParam(raw.sort));
  const page =
    typeof raw.page === "number"
      ? raw.page >= 1 && Number.isFinite(raw.page)
        ? Math.floor(raw.page)
        : 1
      : parseStartupPage(raw.page);
  return { q, category, region, stage, status, hiring, sort, page };
}

export function applyStartupDirectoryQuery(
  cards: readonly StartupPublicCard[],
  query: StartupDirectoryFilters,
  locale: StartupLocale,
): StartupPublicCard[] {
  const needle = query.q.trim().toLowerCase();
  const region = presentText(query.region === "all" ? null : query.region);
  const stage = presentText(query.stage === "all" ? null : query.stage);
  const status = query.status && query.status !== "all" ? query.status : "all";
  const hiring = query.hiring === "hiring" ? "hiring" : "all";
  const sort = query.sort ?? "newest";
  const filtered = cards.filter((card) => {
    if (query.category !== "all" && card.category !== query.category) {
      return false;
    }
    if (region && presentText(card.region) !== region) return false;
    if (stage && presentText(card.stage) !== stage) return false;
    if (status !== "all" && startupExitBucket(card) !== status) return false;
    if (hiring === "hiring" && !startupHasOpenJobs(card)) return false;
    if (!needle) return true;
    const haystack = [
      card.name,
      card.homepage,
      card.region ?? "",
      card.stage ?? "",
      STARTUP_CATEGORY_LABELS[card.category][locale],
      STARTUP_CATEGORY_LABELS[card.category].en,
    ]
      .join("\n")
      .toLowerCase();
    return haystack.includes(needle);
  });

  const sorted = [...filtered];
  if (sort === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name, locale));
    return sorted;
  }
  if (sort === "category") {
    sorted.sort((a, b) => {
      const delta =
        STARTUP_CATEGORY_IDS.indexOf(a.category) -
        STARTUP_CATEGORY_IDS.indexOf(b.category);
      if (delta !== 0) return delta;
      return a.name.localeCompare(b.name, locale);
    });
    return sorted;
  }
  sorted.sort((a, b) => {
    if (a.listedOn === b.listedOn) return a.name.localeCompare(b.name, locale);
    return a.listedOn < b.listedOn ? 1 : -1;
  });
  return sorted;
}

export function startupDirectoryFilterOptions(
  cards: readonly StartupPublicCard[],
): { regions: string[]; stages: string[] } {
  const regions = new Set<string>();
  const stages = new Set<string>();
  for (const card of cards) {
    const region = presentText(card.region);
    if (region) regions.add(region);
    const stage = presentText(card.stage);
    if (stage) stages.add(stage);
  }
  return {
    regions: [...regions].sort((a, b) => a.localeCompare(b)),
    stages: [...stages].sort((a, b) => a.localeCompare(b)),
  };
}

export function paginateStartupCards<T>(
  cards: readonly T[],
  page: number,
  pageSize: number = STARTUPS_PAGE_SIZE,
): {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
} {
  const total = cards.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: cards.slice(start, start + pageSize),
    page: safePage,
    totalPages,
    total,
    pageSize,
  };
}

export function buildStartupDirectoryPath(
  query: Partial<StartupDirectoryQuery> = {},
): string {
  const parsed = parseStartupDirectoryQuery(query);
  const params = new URLSearchParams();
  if (parsed.q.trim()) params.set("q", parsed.q.trim());
  if (parsed.category !== "all") params.set("category", parsed.category);
  if (parsed.region && parsed.region !== "all") {
    params.set("region", parsed.region);
  }
  if (parsed.stage && parsed.stage !== "all") params.set("stage", parsed.stage);
  if (parsed.status && parsed.status !== "all") {
    params.set("status", parsed.status);
  }
  if (parsed.hiring === "hiring") params.set("hiring", "1");
  if (parsed.sort && parsed.sort !== "newest") params.set("sort", parsed.sort);
  if (parsed.page > 1) params.set("page", String(parsed.page));
  const qs = params.toString();
  return qs ? `${STARTUPS_PATH}?${qs}` : STARTUPS_PATH;
}

export function startupDirectoryHasFilters(
  query: StartupDirectoryQuery,
): boolean {
  return (
    query.q.trim().length > 0 ||
    query.category !== "all" ||
    (query.region != null && query.region !== "all") ||
    (query.stage != null && query.stage !== "all") ||
    (query.status != null && query.status !== "all") ||
    query.hiring === "hiring" ||
    (query.sort != null && query.sort !== "newest")
  );
}

export function startupDirectoryCanonicalPath(
  query: StartupDirectoryQuery,
): string {
  if (startupDirectoryHasFilters(query)) return STARTUPS_PATH;
  if (query.page > 1) return `${STARTUPS_PATH}?page=${query.page}`;
  return STARTUPS_PATH;
}

export function startupDirectorySitemapPaths(
  totalCards: number,
  pageSize: number = STARTUPS_PAGE_SIZE,
): string[] {
  const totalPages = Math.max(1, Math.ceil(totalCards / pageSize) || 1);
  const paths: string[] = [];
  for (let page = 2; page <= totalPages; page++) {
    paths.push(`${STARTUPS_PATH}?page=${page}`);
  }
  return paths;
}

/** Promo-ready at ≥3000. Crawl/index is always on — this is not robots. */
export function startupsPublicIndexable(verifiedCount: number): boolean {
  return (
    Number.isFinite(verifiedCount) && verifiedCount >= STARTUPS_PUBLIC_INDEX_MIN
  );
}

/** Directory + Insights are crawlable now. Count does not change robots. */
export function startupsPublicRobots(_verifiedCount?: number): {
  index: true;
  follow: true;
} {
  return { index: true, follow: true };
}

/**
 * Directory + Insights + crawlable ?page=. Always listed — ≥3000 is
 * promo-only, not a sitemap gate.
 */
export function startupInvestigationSitemapPaths(
  verifiedCount: number,
  pageSize: number = STARTUPS_PAGE_SIZE,
): string[] {
  return [
    STARTUPS_PATH,
    STARTUPS_INSIGHTS_PATH,
    STARTUPS_JOBS_PATH,
    ...startupDirectorySitemapPaths(verifiedCount, pageSize),
  ];
}

/** Same-origin favicon for a sourced URL. Soft-omit if the host is unusable. */
export function startupSourceFaviconUrl(href: string): string | null {
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname.includes(".")) return null;
    return `${url.protocol}//${url.host}/favicon.ico`;
  } catch {
    return null;
  }
}

export function startupDirectoryPageNumbers(
  currentPage: number,
  totalPages: number,
): Array<number | "gap"> {
  const pages: Array<number | "gap"> = [];
  const push = (value: number | "gap") => {
    if (pages[pages.length - 1] !== value) pages.push(value);
  };
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      push(i);
    } else {
      push("gap");
    }
  }
  return pages;
}

export function startupsDirectoryJsonLd(
  cards: readonly StartupPublicCard[],
): Record<string, unknown> {
  return {
    "@type": "ItemList",
    name: STARTUPS_H1,
    url: `${CANONICAL_PRODUCTION_ORIGIN}/en${STARTUPS_PATH}`,
    itemListElement: cards.map((card, index) => {
      const item: Record<string, unknown> = {
        "@type": "Organization",
        name: card.name,
        url: card.homepage,
      };
      const description = sanitizeStartupDescription(card.description);
      if (description) item.description = description;
      const sources = displayStartupSources(card.sources);
      if (sources.length > 0) item.sameAs = sources;
      // Organization only — never Person nodes or invented founder images.
      return {
        "@type": "ListItem",
        position: index + 1,
        item,
      };
    }),
  };
}
