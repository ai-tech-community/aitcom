/**
 * Path redirects for next.config.js.
 *
 * Next.js serves `permanent: true` as HTTP 308. The retired `/tools` path
 * uses `statusCode: 301` instead. Subpaths of a retired section collapse to
 * that section's destination; they do not keep the rest of the path.
 * `/tools` is only the path itself: `/en/tools/extra` is not redirected.
 *
 * Next's redirect matcher makes a trailing slash optional, so `/en/tools`
 * and `/en/tools/` share one rule. `next.config.js` sets
 * `skipTrailingSlashRedirect` and appends `trailingSlashRedirect` after
 * this list. Without that, Next's built-in slash strip (308) runs first
 * and `/en/tools/` never reaches the 301.
 *
 * Startup URLs that are the same page (the directory, Insights, and Jobs)
 * use HTTP 301. Company profiles are not listed here. A profile that is
 * the same company 301s from the node route. A slug whose `/startups`
 * page is a different entity is rendered with a canonical instead.
 *
 * The jobs rules stay ahead of the directory rule so
 * `/en/investigations/startups/jobs` still lands on `/en/jobs`.
 *
 * `/[locale]/startups/ai-tools-list` is one page for every configured
 * locale, so en, nl, and fr each redirect `/tools`.
 */
export const siteRedirects = [
  {
    source: "/:locale(en|nl|fr)/investigations/startups/jobs",
    destination: "/:locale/jobs",
    statusCode: 301,
  },
  {
    source: "/:locale(en|nl|fr)/investigations/startups/jobs/:path*",
    destination: "/:locale/jobs/:path*",
    statusCode: 301,
  },
  {
    source: "/:locale(en|nl|fr)/startups/jobs",
    destination: "/:locale/jobs",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/startups/jobs/:path*",
    destination: "/:locale/jobs/:path*",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/communities/:slug/jobs",
    destination: "/:locale/jobs",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/investigations/startups",
    destination: "/:locale/startups",
    statusCode: 301,
  },
  {
    source: "/:locale(en|nl|fr)/investigations/startups/insights",
    destination: "/:locale/startups/insights",
    statusCode: 301,
  },
  {
    source: "/:locale(en|nl|fr)/benchmark",
    destination: "/:locale/agents",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/benchmark/:path*",
    destination: "/:locale/agents",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/challenges",
    destination: "/:locale/communities",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/challenges/:path*",
    destination: "/:locale/communities",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/impact",
    destination: "/:locale",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/impact/:path*",
    destination: "/:locale",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/tools",
    destination: "/:locale/startups/ai-tools-list",
    statusCode: 301,
  },
];

/**
 * Same slash strip Next adds internally when `trailingSlash` is false.
 * Kept after `siteRedirects` so a specific 301 can match `/tools/` first.
 * Not marked `internal`: Next rejects that field on user redirects, and the
 * source already requires a trailing slash.
 */
export const trailingSlashRedirect = {
  source: "/:path+/",
  destination: "/:path+",
  permanent: true,
};

/** HTTP status Next.js emits for `permanent: true`. */
export const PERMANENT_REDIRECT_STATUS = 308;
