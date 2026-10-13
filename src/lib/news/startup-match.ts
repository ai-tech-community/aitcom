import type { NewsMatchCompany } from "@/lib/news/companies";
import {
  displayStartupLogoUrl,
  startupSourceFaviconUrl,
  buildStartupProfilePath,
} from "@/lib/investigations/startups";

/**
 * A directory startup a news row can point at. Matching is exact on purpose:
 * the homepage domain, or the startup's name as a whole word.
 */
export type NewsStartupRef = {
  id: string;
  slug: string;
  name: string;
  homepage: string;
};

/** Names shorter than this never match by name. Domain matching still can. */
export const NEWS_STARTUP_NAME_MIN = 5;

/**
 * Names this short are matched with their original casing, so "Apple" does
 * not fire on "apple" and "OpenAI" does not fire on "openai".
 */
export const NEWS_STARTUP_CASE_SENSITIVE_MAX = 8;

/**
 * Generic words. A name made only of these never matches by name.
 * Domain matching is unchanged.
 */
const NEWS_STARTUP_STOPWORDS = new Set([
  "ai",
  "lab",
  "labs",
  "news",
  "blog",
  "data",
  "tech",
  "cloud",
  "app",
  "apps",
  "inc",
  "llc",
  "ltd",
  "the",
  "and",
  "open",
  "model",
  "models",
  "agent",
  "agents",
  "startup",
  "startups",
  "company",
  "companies",
  "platform",
  "software",
  "research",
  "science",
  "global",
  "digital",
  "systems",
  "system",
  "group",
  "capital",
  "ventures",
  "venture",
  "studio",
  "studios",
  "intelligence",
  "machine",
  "learning",
  "media",
  "press",
  "daily",
  "review",
  "today",
  "world",
  "online",
  "network",
  "networks",
  "solutions",
  "services",
  "technology",
  "technologies",
  "artificial",
  "source",
  "new",
  "next",
  "one",
  "core",
  "base",
  "hub",
  "team",
  "teams",
  "official",
  "home",
  "about",
  "info",
  "update",
  "updates",
  "report",
  "reports",
  "story",
  "stories",
]);

export type NewsStartupLink = NewsStartupRef & {
  logoUrl: string | null;
};

/** One stored news row shown on a startup profile. */
export type StartupNewsMention = {
  kind: "story" | "rumor";
  id: string;
  title: string;
  href: string;
  source: string;
  at: string | null;
};

export type NewsCompanyMark = NewsMatchCompany;

export function newsStartupHostname(
  href: string | null | undefined,
): string | null {
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host.includes(".")) return null;
    return host;
  } catch {
    return null;
  }
}

function nameWords(name: string): string[] {
  return name
    .trim()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** True when the name is too generic to match on its own. */
export function isGenericStartupName(name: string): boolean {
  const words = nameWords(name);
  if (words.length === 0) return true;
  return words.every((word) => NEWS_STARTUP_STOPWORDS.has(word.toLowerCase()));
}

const LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u;

function isWordChar(char: string | undefined): boolean {
  return char != null && char !== "" && LETTER_OR_NUMBER.test(char);
}

/**
 * Whole-token search. `blockedAfter` is extra characters that must not
 * follow the needle (a dot, so a longer hostname does not match).
 */
function hasBoundedToken(
  haystack: string,
  needle: string,
  blockedAfter: string,
): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  let from = 0;
  while (from <= haystack.length - needle.length) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = at > 0 ? haystack[at - 1] : undefined;
    const after = haystack[at + needle.length];
    const afterBlocked = after != null && blockedAfter.includes(after);
    if (!isWordChar(before) && !isWordChar(after) && !afterBlocked) return true;
    from = at + 1;
  }
  return false;
}

/** Article host equals the startup host, or sits under it. Not the reverse. */
export function startupHostCovers(
  articleHost: string,
  startupHost: string,
): boolean {
  return articleHost === startupHost || articleHost.endsWith(`.${startupHost}`);
}

/** A startup prepared once so a batch of news rows can share the work. */
export type IndexedNewsStartup = {
  startup: NewsStartupRef;
  host: string;
  /** Null when the name is too short or generic to match on its own. */
  name: string | null;
  lowerName: string | null;
  caseSensitive: boolean;
};

/**
 * Parse each homepage and decide name matching once. The deploy backfill
 * walks every approved startup, so this must not recompile a pattern per row.
 */
export function indexNewsStartups(
  startups: readonly NewsStartupRef[],
): IndexedNewsStartup[] {
  const indexed: IndexedNewsStartup[] = [];
  for (const startup of startups) {
    const host = newsStartupHostname(startup.homepage);
    if (!host) continue;
    const trimmed = startup.name.trim();
    const nameOk =
      trimmed.length >= NEWS_STARTUP_NAME_MIN && !isGenericStartupName(trimmed);
    indexed.push({
      startup,
      host,
      name: nameOk ? trimmed : null,
      lowerName: nameOk ? trimmed.toLowerCase() : null,
      caseSensitive: trimmed.length <= NEWS_STARTUP_CASE_SENSITIVE_MAX,
    });
  }
  return indexed;
}

/**
 * Startups this item is about. A hit is the startup's own domain (the article
 * host, or the domain written in the text) or its exact name. Short names
 * keep their casing. Generic names do not match by name.
 */
export function matchIndexedNewsStartups(
  input: { title: string; text: string; url: string | null },
  startups: readonly IndexedNewsStartup[],
): NewsStartupRef[] {
  const haystack = `\n${input.title}\n${input.text}\n`;
  const lower = haystack.toLowerCase();
  const articleHost = newsStartupHostname(input.url);
  const found: NewsStartupRef[] = [];
  const seen = new Set<string>();
  for (const entry of startups) {
    const byDomain =
      (articleHost != null && startupHostCovers(articleHost, entry.host)) ||
      hasBoundedToken(lower, entry.host, ".");
    const byName =
      entry.name != null &&
      entry.lowerName != null &&
      hasBoundedToken(
        entry.caseSensitive ? haystack : lower,
        entry.caseSensitive ? entry.name : entry.lowerName,
        "",
      );
    if (!byDomain && !byName) continue;
    if (seen.has(entry.startup.id)) continue;
    seen.add(entry.startup.id);
    found.push(entry.startup);
  }
  return found;
}

/** Match one item. Batches should call `indexNewsStartups` once. */
export function matchNewsStartups(
  input: { title: string; text: string; url: string | null },
  startups: readonly NewsStartupRef[],
): NewsStartupRef[] {
  return matchIndexedNewsStartups(input, indexNewsStartups(startups));
}

function logoHost(logoUrl: string): string | null {
  return newsStartupHostname(logoUrl);
}

/**
 * Point a company mark at the startup profile when a stored match shares
 * that mark's directory id or logo host. A stored startup with no mark yet
 * is added, using its stored logo or its own favicon.
 */
export function applyNewsStartupLinks(
  companies: readonly NewsCompanyMark[],
  links: readonly NewsStartupLink[],
): NewsCompanyMark[] {
  const next = companies.map((company) => ({ ...company }));
  for (const link of links) {
    const path = buildStartupProfilePath(link.slug);
    const home = newsStartupHostname(link.homepage);
    let attached = false;
    for (const company of next) {
      const sameStartup = company.id === `dir:${link.slug}`;
      const host = logoHost(company.logoUrl);
      const sameHost =
        home != null && host != null && startupHostCovers(host, home);
      if (!sameStartup && !sameHost) continue;
      company.profilePath = path;
      attached = true;
    }
    if (attached) continue;
    const logoUrl =
      displayStartupLogoUrl(link.logoUrl) ??
      startupSourceFaviconUrl(link.homepage);
    if (!logoUrl) continue;
    next.push({
      id: `dir:${link.slug}`,
      name: link.name,
      logoUrl,
      profilePath: path,
    });
  }
  return next;
}
