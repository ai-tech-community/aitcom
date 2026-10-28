/**
 * The URLs of magazine pages, in one place (spec 2026-10-26, Decision 10:
 * one reading URL per issue, whatever its visibility). Locale-free: pass
 * them to the next-intl `Link` / `redirect`, which add the locale.
 */

type Slugged = { slug: string };

/** The `/magazines` home: every public issue on the platform. */
export const MAGAZINES_HOME_PATH = "/magazines";

export const MAGAZINE_SUBSCRIPTION_CONFIRM_PATH =
  "/magazine-subscriptions/confirm";

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

/** Share images include their locale and cannot shadow an article slug. */
export function issueShareImagePath(
  locale: string,
  magazine: Slugged,
  issue: Slugged,
): string {
  return `/${locale}/og/magazine/${magazine.slug}/${issue.slug}`;
}

export function articleShareImagePath(
  locale: string,
  magazine: Slugged,
  issue: Slugged,
  article: Slugged,
): string {
  return `${issueShareImagePath(locale, magazine, issue)}/${article.slug}`;
}

/** The community's Magazine tab (reader shelf and editor desk). */
export function communityMagazinePath(communitySlug: string): string {
  return `/communities/${communitySlug}/magazine`;
}

/** Where the editors read and decide on an article sent to the magazine. */
export function magazineReviewPath(
  communitySlug: string,
  articleSlug: string,
): string {
  return `${communityMagazinePath(communitySlug)}/review/${articleSlug}`;
}

/** The issue builder for one issue of the community's magazine. */
export function issueBuilderPath(
  communitySlug: string,
  issueId: number,
): string {
  return `${communityMagazinePath(communitySlug)}/issues/${issueId}/edit`;
}

/** The magazine's settings (create or edit) in the magazine area. */
export function magazineSettingsPath(communitySlug: string): string {
  return `${communityMagazinePath(communitySlug)}/settings`;
}

/** Where editors set up automatic drafts. */
export function magazineAutoDraftPath(communitySlug: string): string {
  return `${communityMagazinePath(communitySlug)}/auto-draft`;
}

/** Where magazine managers choose the team. */
export function magazineTeamPath(communitySlug: string): string {
  return `${communityMagazinePath(communitySlug)}/team`;
}

/** Where an editor writes a new article for the community's magazine. */
export function magazineWritePath(communitySlug: string): string {
  return `${communityMagazinePath(communitySlug)}/write`;
}

/** Where an editor edits one of their magazine articles. */
export function magazineArticleEditPath(
  communitySlug: string,
  articleSlug: string,
): string {
  return `${communityMagazinePath(communitySlug)}/articles/${articleSlug}/edit`;
}
