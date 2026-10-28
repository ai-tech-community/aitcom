/**
 * The news game stays out of search: the weekly board, a contribution
 * badge, a claim, and any per-week URL. Claiming itself is a button that
 * POSTs; it has no page of its own.
 */

const NEWS_CONTRIBUTION_BADGES = new Set([
  "news_first_scoop",
  "news_five_stories",
  "news_region_eu",
  "news_region_il",
  "news_region_asia",
]);

export function isNewsContributionBadge(slug: string): boolean {
  return NEWS_CONTRIBUTION_BADGES.has(slug);
}

export function newsGameRobots(): { index: false; follow: true } {
  return { index: false, follow: true };
}

/**
 * Robots for a badge share page. News contribution badges stay noindex
 * even when the profile is public. Other badges follow the profile.
 */
export function badgeShareRobots(
  slug: string,
  isPublic: boolean,
): { index: false; follow: boolean } | undefined {
  if (isNewsContributionBadge(slug)) {
    return { index: false, follow: isPublic };
  }
  if (!isPublic) return { index: false, follow: false };
  return undefined;
}

function splitPath(path: string): { pathname: string; search: string } {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const url = new URL(path);
      return { pathname: url.pathname, search: url.search };
    } catch {
      return { pathname: path, search: "" };
    }
  }
  const query = path.indexOf("?");
  if (query < 0) return { pathname: path, search: "" };
  return { pathname: path.slice(0, query), search: path.slice(query) };
}

/** True when this URL is a news board, contribution badge, claim, or week. */
export function isUnlistedNewsGamePath(path: string): boolean {
  const { pathname, search } = splitPath(path);
  const bare = pathname.replace(/^\/(?:en|nl|fr)(?=\/)/, "") || "/";
  if (bare === "/news" || bare.startsWith("/news/")) return true;
  if (
    /\/badges\/news_(?:first_scoop|five_stories|region_(?:eu|il|asia))(?:\/|$)/.test(
      pathname,
    )
  ) {
    return true;
  }
  if (/(?:^|[?&])(?:week|claim)=/.test(search)) {
    return (
      bare === "/news" || bare.startsWith("/news/") || bare.includes("/badges/")
    );
  }
  return false;
}
