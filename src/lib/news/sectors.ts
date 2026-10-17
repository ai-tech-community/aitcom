import { newsGameRobots } from "@/lib/news/indexability";

/**
 * A community picks one news sector. AI is the default for communities that
 * have not chosen yet. Only sectors with a real feed show stories.
 */
export const NEWS_SECTORS = [
  "ai",
  "sports",
  "expat",
  "local_business",
  "tech",
  "other",
] as const;

export type NewsSector = (typeof NEWS_SECTORS)[number];

export const DEFAULT_NEWS_SECTOR: NewsSector = "ai";

/** Built-in feeds in `NEWS_FEEDS` are AI. No other sector has a catalog feed. */
const CATALOG_FEED_SECTORS = new Set<NewsSector>(["ai"]);

export function isNewsSector(value: string): value is NewsSector {
  return (NEWS_SECTORS as readonly string[]).includes(value);
}

/** Query and form values. Unknown text is dropped. Hyphens match the slug. */
export function parseNewsSector(value: unknown): NewsSector | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const sector = raw.trim().toLowerCase().replace(/-/g, "_");
  return isNewsSector(sector) ? sector : null;
}

export function newsSectorOrDefault(value: unknown): NewsSector {
  return parseNewsSector(value) ?? DEFAULT_NEWS_SECTOR;
}

/** True when the shipped feed list covers this sector. Sports and the rest do not. */
export function catalogHasRealFeeds(sector: NewsSector): boolean {
  return CATALOG_FEED_SECTORS.has(sector);
}

/**
 * A sector filter with no real stories stays out of the index. A sector that
 * does have stories uses the same robots as `/news` (itself noindex) and
 * still canonicalizes to that unfiltered URL.
 */
export function newsSectorViewRobots(hasRealStories: boolean): {
  index: boolean;
  follow: true;
} {
  if (!hasRealStories) return { index: false, follow: true };
  return newsGameRobots();
}

/** Filtered sector URLs point at the unfiltered news page. */
export function newsSectorCanonicalPath(): "/news" {
  return "/news";
}
