import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import {
  sourcedStartupPlaceLabel,
  startupPlaceCentroid,
} from "./startups-places";

export const STARTUPS_PATH = "/investigations/startups";

export const STARTUPS_INSIGHTS_PATH = "/investigations/startups/insights";

export const STARTUPS_H1 = "AI startups";

export const STARTUPS_META =
  "Companies that materially enable AI — models, agents, AI infra, robotics, energy, and verticals. Homepage and sources verified. Not a size or price scorecard.";

export const STARTUPS_INSIGHTS_H1 = "AI startups insights";

export const STARTUPS_INSIGHTS_META =
  "Added over time, plus category, region, stage, and source coverage — from the live directory only. Blank region and stage stay omitted.";

export const STARTUPS_JOIN_HREF =
  "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=investigations&utm_campaign=startups";

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
  listedOn: string;
};

export type StartupSort = "newest";

export type StartupDirectoryFilters = {
  q: string;
  category: StartupCategoryId | "all";
  sort?: StartupSort;
};

export type StartupDirectoryQuery = StartupDirectoryFilters & {
  page: number;
};

export type StartupMapPin = {
  id: string;
  name: string;
  homepage: string;
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

/** Visible `<a>` label from the URL itself — never a fabricated metric. */
export function startupSourceLabel(
  href: string,
  locale: StartupLocale = "en",
): string {
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "en.wikipedia.org" || host.endsWith(".wikipedia.org")) {
      return "Wikipedia";
    }
    if (host === "techcrunch.com") return "TechCrunch";
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (
      path.endsWith("/about") ||
      path.endsWith("/about-us") ||
      /\/company(?:\/|$)/.test(path)
    ) {
      return locale === "nl" ? "Over" : "About";
    }
    if (
      path.includes("/blog") ||
      path.includes("/newsroom") ||
      path.includes("/news")
    ) {
      return "Blog";
    }
    if (path.includes("/press")) {
      return locale === "nl" ? "Pers" : "Press";
    }
    return host;
  } catch {
    return href;
  }
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
    "id" | "name" | "homepage" | "region" | "lat" | "lng"
  >,
): StartupMapPin | null {
  const coords = resolveStartupPinCoords(card);
  if (!coords) return null;
  return {
    id: card.id,
    name: card.name,
    homepage: card.homepage,
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

export function parseStartupDirectoryQuery(raw: {
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
  page?: string | string[] | number;
}): StartupDirectoryQuery {
  const q = firstParam(raw.q)?.trim() ?? "";
  const category = parseStartupCategory(firstParam(raw.category)) ?? "all";
  const sort: StartupSort = "newest";
  const page =
    typeof raw.page === "number"
      ? raw.page >= 1 && Number.isFinite(raw.page)
        ? Math.floor(raw.page)
        : 1
      : parseStartupPage(raw.page);
  return { q, category, sort, page };
}

export function applyStartupDirectoryQuery(
  cards: readonly StartupPublicCard[],
  query: StartupDirectoryFilters,
  locale: StartupLocale,
): StartupPublicCard[] {
  const needle = query.q.trim().toLowerCase();
  const filtered = cards.filter((card) => {
    if (query.category !== "all" && card.category !== query.category) {
      return false;
    }
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

  return [...filtered].sort((a, b) => {
    if (a.listedOn === b.listedOn) return a.name.localeCompare(b.name);
    return a.listedOn < b.listedOn ? 1 : -1;
  });
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
  if (parsed.page > 1) params.set("page", String(parsed.page));
  const qs = params.toString();
  return qs ? `${STARTUPS_PATH}?${qs}` : STARTUPS_PATH;
}

export function startupDirectoryHasFilters(
  query: StartupDirectoryQuery,
): boolean {
  return query.q.trim().length > 0 || query.category !== "all";
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
      const sources = displayStartupSources(card.sources);
      if (sources.length > 0) item.sameAs = sources;
      return {
        "@type": "ListItem",
        position: index + 1,
        item,
      };
    }),
  };
}
