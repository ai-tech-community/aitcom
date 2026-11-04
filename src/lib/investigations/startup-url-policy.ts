import { routing } from "@/i18n/routing";

/**
 * Which URL is the startup, and which legacy URL may say so.
 *
 * `/startups/<slug>` is the main page. `/investigations/startups/<slug>`
 * sends a 301 only when that URL is the same company. When `/startups/<slug>`
 * is a different page, the investigations URL stays up and its canonical
 * points at `/startups/<slug>`.
 *
 * Navier AI is the holdout. Search Console is still comparing its two URLs,
 * so neither URL redirects and neither URL publishes a canonical.
 */

export const STARTUP_CANONICAL_HOLDOUT_SLUG = "navier-ai";

/** Same limit as `parseStartupSlug`. Kept here so middleware stays off the db graph. */
const STARTUP_SLUG_MAX = 80;

const STARTUP_SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs whose `/startups/<slug>` route is not that company's profile.
 * `insights` and `jobs` are reserved. `ai-tools-list` is the AI tools
 * directory, which shares its slug with the AIAI.Tools row.
 */
const STARTUPS_PATH_NOT_PROFILE = new Set([
  "insights",
  "jobs",
  "ai-tools-list",
]);

export type StartupLegacyKind =
  | "redirect"
  | "canonical"
  | "holdout"
  | "missing";

export function isStartupSlugShape(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= STARTUP_SLUG_MAX &&
    STARTUP_SLUG_SHAPE.test(slug)
  );
}

export function isStartupCanonicalHoldout(slug: string): boolean {
  return slug === STARTUP_CANONICAL_HOLDOUT_SLUG;
}

/** True when `/startups/<slug>` renders that company's profile. */
export function startupsPathRendersProfile(slug: string): boolean {
  return !STARTUPS_PATH_NOT_PROFILE.has(slug);
}

export function buildInvestigationStartupPath(slug: string): string {
  return `/investigations/startups/${slug}`;
}

/**
 * What to do with one investigations URL once the startup row is known.
 * `startupSlug` is the approved row's slug, or null when there is no row.
 */
export function startupLegacyKind(
  slug: string,
  startupSlug: string | null,
): StartupLegacyKind {
  if (!isStartupSlugShape(slug)) return "missing";
  if (isStartupCanonicalHoldout(slug)) {
    return startupSlug === slug ? "holdout" : "missing";
  }
  if (startupSlug == null) return "missing";
  if (!startupsPathRendersProfile(slug) || startupSlug !== slug) {
    return "canonical";
  }
  return "redirect";
}

/** Middleware rewrites these to the 301 route. Holdouts and other pages render. */
export function investigationStartupShouldRewrite(slug: string): boolean {
  if (!isStartupSlugShape(slug)) return false;
  if (isStartupCanonicalHoldout(slug)) return false;
  if (!startupsPathRendersProfile(slug)) return false;
  return true;
}

/**
 * Internal path that answers a same-entity investigations URL with HTTP 301.
 * Null when this request should render a page instead.
 */
export function investigationStartupRewriteTarget(
  pathname: string,
): string | null {
  const locales = routing.locales.join("|");
  const match = new RegExp(
    `^/(${locales})/investigations/startups/([^/]+)/?$`,
  ).exec(pathname);
  if (!match) return null;
  const locale = match[1];
  const raw = match[2];
  if (!locale || !raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const slug = decoded.toLowerCase();
  if (!investigationStartupShouldRewrite(slug)) return null;
  return `/api/startup-profile-redirect/${locale}/${slug}`;
}

/** Sitemap path for a holdout profile, or null when that slug is not one. */
export function startupHoldoutInvestigationPath(slug: string): string | null {
  if (!isStartupSlugShape(slug) || !isStartupCanonicalHoldout(slug))
    return null;
  return buildInvestigationStartupPath(slug);
}

export function startupHoldoutInvestigationPaths(
  slugs: readonly string[],
): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const raw of slugs) {
    const path = startupHoldoutInvestigationPath(raw.trim().toLowerCase());
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
}

/**
 * Drop investigations URLs that 301 or canonical elsewhere. The Navier AI
 * holdout stays, because that URL has neither signal.
 */
export function filterStartupSitemapPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    if (
      path === "/investigations/startups" ||
      path === "/investigations/startups/insights" ||
      path === "/investigations/startups/jobs" ||
      path.startsWith("/investigations/startups/jobs/")
    ) {
      return false;
    }
    const match = /^\/investigations\/startups\/([^/]+)$/.exec(path);
    if (!match) return true;
    return isStartupCanonicalHoldout(match[1] ?? "");
  });
}
