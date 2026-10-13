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

function mentionsExactName(haystack: string, name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < NEWS_STARTUP_NAME_MIN) return false;
  if (isGenericStartupName(trimmed)) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flags = trimmed.length <= NEWS_STARTUP_CASE_SENSITIVE_MAX ? "u" : "iu";
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,
    flags,
  ).test(haystack);
}

/** Article host equals the startup host, or sits under it. Not the reverse. */
export function startupHostCovers(
  articleHost: string,
  startupHost: string,
): boolean {
  return articleHost === startupHost || articleHost.endsWith(`.${startupHost}`);
}

function mentionsDomain(haystack: string, startupHost: string): boolean {
  const escaped = startupHost.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}.])`,
    "iu",
  ).test(haystack);
}

/**
 * Startups this item is about. A hit is the startup's own domain (the article
 * host, or the domain written in the text) or its exact name. Short names
 * keep their casing. Generic names do not match by name.
 */
export function matchNewsStartups(
  input: { title: string; text: string; url: string | null },
  startups: readonly NewsStartupRef[],
): NewsStartupRef[] {
  const haystack = `\n${input.title}\n${input.text}\n`;
  const articleHost = newsStartupHostname(input.url);
  const found: NewsStartupRef[] = [];
  const seen = new Set<string>();
  for (const startup of startups) {
    const home = newsStartupHostname(startup.homepage);
    if (!home) continue;
    const byDomain =
      (articleHost != null && startupHostCovers(articleHost, home)) ||
      mentionsDomain(haystack, home);
    const byName = mentionsExactName(haystack, startup.name);
    if (!byDomain && !byName) continue;
    if (seen.has(startup.id)) continue;
    seen.add(startup.id);
    found.push(startup);
  }
  return found;
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
