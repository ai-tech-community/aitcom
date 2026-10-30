/**
 * Path redirects for next.config.js.
 *
 * Next.js serves `permanent: true` as HTTP 308 (not 301). Subpaths of a
 * retired section collapse to that section's destination; they do not keep
 * the rest of the path.
 *
 * The investigations/startups rules stay ahead of any broader pattern so
 * `/en/investigations/startups/jobs` still lands on `/en/jobs`.
 */
export const siteRedirects = [
  {
    source: "/:locale(en|nl|fr)/investigations/startups/jobs",
    destination: "/:locale/jobs",
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/investigations/startups/jobs/:path*",
    destination: "/:locale/jobs/:path*",
    permanent: true,
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
    permanent: true,
  },
  {
    source: "/:locale(en|nl|fr)/investigations/startups/:path*",
    destination: "/:locale/startups/:path*",
    permanent: true,
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
];

/** HTTP status Next.js emits for `permanent: true`. */
export const PERMANENT_REDIRECT_STATUS = 308;
