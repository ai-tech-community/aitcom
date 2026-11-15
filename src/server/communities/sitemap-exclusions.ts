import { HUB_SLUG } from "./hub";

/**
 * Sitemap rules for communities (ADR-0050). Two rules, as on the site:
 *
 * - The **front page** (`/communities/<slug>`) follows listing: a community
 *   on the directory (`isPublicDirectoryCommunity`, the Hub included) keeps
 *   it, even when it is private, because outsiders see who it is and how to
 *   join there. An unlisted community contributes no front page.
 * - Every page **inside** (forum thread, event, classroom, and so on)
 *   follows the content rule: a community whose content is members-only
 *   (`hiddenContentCommunityIds`) contributes none, in any locale.
 */

/** True when this doc is scoped to a community the sitemap must omit. */
export function docBelongsToHiddenCommunity(
  communityId: string | null | undefined,
  hiddenCommunityIds: readonly string[] | null,
): boolean {
  if (communityId == null || communityId === "") return false;
  // Visibility unknown: keep no community-scoped URL.
  if (hiddenCommunityIds === null) return true;
  return hiddenCommunityIds.includes(communityId);
}

/** Slugs the sitemap must not publish. The Hub is never one of them. */
export function hiddenCommunitySlugs(
  slugById: ReadonlyMap<string, string>,
  hiddenIds: readonly string[],
): Set<string> {
  const slugs = new Set<string>();
  for (const id of hiddenIds) {
    const slug = slugById.get(id);
    if (slug && slug !== HUB_SLUG) slugs.add(slug);
  }
  return slugs;
}

/**
 * Which community slugs the sitemap must not publish, per rule. `frontPage`
 * is every live community off the directory (all but the Hub when the
 * directory lookup failed: fail closed); `inside` is every community whose
 * content is members-only.
 */
export type SitemapCommunityRules = {
  frontPage: ReadonlySet<string>;
  inside: ReadonlySet<string>;
};

export function sitemapCommunityRules(
  slugById: ReadonlyMap<string, string>,
  contentHiddenIds: readonly string[],
  directorySlugs: ReadonlySet<string> | null,
): SitemapCommunityRules {
  const frontPage = new Set<string>();
  for (const slug of slugById.values()) {
    if (slug === HUB_SLUG) continue;
    if (!directorySlugs?.has(slug)) {
      frontPage.add(slug);
    }
  }
  return {
    frontPage,
    inside: hiddenCommunitySlugs(slugById, contentHiddenIds),
  };
}

/** Where `/communities/<slug>` occurs in `url`, as a whole slug. */
function communityPathEnds(url: string, slug: string): string[] {
  const needle = `/communities/${slug}`;
  const ends: string[] = [];
  let from = 0;
  while (from < url.length) {
    const at = url.indexOf(needle, from);
    if (at === -1) break;
    const next = url[at + needle.length];
    if (next === undefined || next === "/" || next === "?" || next === "#") {
      ends.push(url.slice(at + needle.length));
    }
    from = at + needle.length;
  }
  return ends;
}

/** True when `url` is a page below the front page of one of `slugs`. */
export function urlListsCommunityInside(
  url: string,
  slugs: ReadonlySet<string>,
): boolean {
  for (const slug of slugs) {
    if (
      communityPathEnds(url, slug).some(
        (rest) => rest.startsWith("/") && rest.length > 1,
      )
    ) {
      return true;
    }
  }
  return false;
}

/** The front page itself (no path below it) of one of `slugs`. */
function urlIsCommunityFrontPage(
  url: string,
  slugs: ReadonlySet<string>,
): boolean {
  for (const slug of slugs) {
    if (
      communityPathEnds(url, slug).some(
        (rest) => !rest.startsWith("/") || rest === "/",
      )
    ) {
      return true;
    }
  }
  return false;
}

/**
 * True when `url` breaks a rule: a front page off the directory, or a page
 * inside a members-only community. Matches path and absolute locale URLs
 * (`/en/...`, `/nl/...`). A shorter slug does not match a longer one
 * (`demo` vs `demo-community`).
 */
export function urlBreaksCommunityRules(
  url: string,
  rules: SitemapCommunityRules,
): boolean {
  return (
    urlIsCommunityFrontPage(url, rules.frontPage) ||
    urlListsCommunityInside(url, rules.inside)
  );
}

type SitemapEntry = {
  url: string;
  alternates?: { languages?: Record<string, string | URL | undefined> };
};

/** Drops entries whose canonical URL or any locale alternate is hidden. */
export function withoutHiddenCommunityUrls<T extends SitemapEntry>(
  entries: readonly T[],
  rules: SitemapCommunityRules,
): T[] {
  if (rules.frontPage.size === 0 && rules.inside.size === 0) {
    return [...entries];
  }
  return entries.filter((entry) => {
    if (urlBreaksCommunityRules(entry.url, rules)) return false;
    const languages = entry.alternates?.languages;
    if (!languages) return true;
    return Object.values(languages).every(
      (url) => url == null || !urlBreaksCommunityRules(String(url), rules),
    );
  });
}
