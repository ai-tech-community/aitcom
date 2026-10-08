import { HUB_SLUG } from "./hub";

/**
 * Sitemap rules for unlisted communities (ADR-0030, `isListedInDirectory`).
 * A hidden community contributes no URL: not its page, and not a child
 * (forum thread, event, classroom, and so on) in any locale.
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
 * True when `url` is a community page or any child of a hidden community.
 * Matches path and absolute locale URLs (`/en/...`, `/nl/...`). A shorter
 * slug does not match a longer one (`demo` vs `demo-community`).
 */
export function urlListsHiddenCommunity(
  url: string,
  hiddenSlugs: ReadonlySet<string>,
): boolean {
  for (const slug of hiddenSlugs) {
    const needle = `/communities/${slug}`;
    let from = 0;
    while (from < url.length) {
      const at = url.indexOf(needle, from);
      if (at === -1) break;
      const next = url[at + needle.length];
      if (next === undefined || next === "/" || next === "?" || next === "#") {
        return true;
      }
      from = at + needle.length;
    }
  }
  return false;
}

type SitemapEntry = {
  url: string;
  alternates?: { languages?: Record<string, string | URL | undefined> };
};

/** Drops entries whose canonical URL or any locale alternate is hidden. */
export function withoutHiddenCommunityUrls<T extends SitemapEntry>(
  entries: readonly T[],
  hiddenSlugs: ReadonlySet<string>,
): T[] {
  if (hiddenSlugs.size === 0) return [...entries];
  return entries.filter((entry) => {
    if (urlListsHiddenCommunity(entry.url, hiddenSlugs)) return false;
    const languages = entry.alternates?.languages;
    if (!languages) return true;
    return Object.values(languages).every(
      (url) =>
        url == null || !urlListsHiddenCommunity(String(url), hiddenSlugs),
    );
  });
}
