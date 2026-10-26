/**
 * The URLs of magazine pages, in one place (spec 2026-10-26, Decision 10:
 * one reading URL per issue, whatever its visibility). Locale-free: pass
 * them to the next-intl `Link` / `redirect`, which add the locale.
 */

type Slugged = { slug: string };

/** The `/magazines` home: every public issue on the platform. */
export const MAGAZINES_HOME_PATH = "/magazines";

/** The `/magazines` home narrowed to one topic, or the whole home. */
export function magazinesTopicPath(topic: string | null): string {
  return topic
    ? `${MAGAZINES_HOME_PATH}?topic=${encodeURIComponent(topic)}`
    : MAGAZINES_HOME_PATH;
}

/** The public shelf of one magazine. */
export function magazinePath(magazine: Slugged): string {
  return `${MAGAZINES_HOME_PATH}/${magazine.slug}`;
}

/** The reading page of one issue. */
export function issuePath(magazine: Slugged, issue: Slugged): string {
  return `${magazinePath(magazine)}/${issue.slug}`;
}

/** The long-read page of a magazine article, under the issue that holds it. */
export function magazineArticlePath(
  magazine: Slugged,
  issue: Slugged,
  article: Slugged,
): string {
  return `${issuePath(magazine, issue)}/${article.slug}`;
}

/** The community's Magazine tab (reader shelf and editor desk). */
export function communityMagazinePath(communitySlug: string): string {
  return `/communities/${communitySlug}/magazine`;
}

/** The issue builder for one issue of the community's magazine. */
export function issueBuilderPath(
  communitySlug: string,
  issueId: number,
): string {
  return `${communityMagazinePath(communitySlug)}/issues/${issueId}/edit`;
}
