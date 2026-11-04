import { routing } from "@/i18n/routing";

/**
 * Which URL is the startup, and which legacy URL may say so.
 *
 * `/startups/<slug>` is the main page. `/investigations/startups/<slug>`
 * sends a 301 only when that URL is the same company. When `/startups/<slug>`
 * is a different page, the investigations URL stays up and its canonical
 * points at `/startups/<slug>`.
 */

/** Same limit as `parseStartupSlug`. Kept here so middleware stays off the db graph. */
const STARTUP_SLUG_MAX = 80;

const STARTUP_SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Slugs whose `/startups/<slug>` route is not that company's profile.
 * `insights`, `jobs`, `claim`, and `submit` are reserved. `ai-tools-list` is the AI tools
 * directory, which shares its slug with the AIAI.Tools row.
 */
const STARTUPS_PATH_NOT_PROFILE = new Set([
  "insights",
  "jobs",
  "claim",
  "submit",
  "ai-tools-list",
]);

export type StartupLegacyKind = "redirect" | "canonical" | "missing";

export function isStartupSlugShape(slug: string): boolean {
  return (
    slug.length > 0 &&
    slug.length <= STARTUP_SLUG_MAX &&
    STARTUP_SLUG_SHAPE.test(slug)
  );
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
  if (startupSlug == null) return "missing";
  if (!startupsPathRendersProfile(slug) || startupSlug !== slug) {
    return "canonical";
  }
  return "redirect";
}

/** Middleware rewrites these to the 301 route. Other pages render. */
export function investigationStartupShouldRewrite(slug: string): boolean {
  if (!isStartupSlugShape(slug)) return false;
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

/**
 * Drop investigations URLs that 301 or canonical elsewhere.
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
    return !/^\/investigations\/startups\/([^/]+)$/.test(path);
  });
}
