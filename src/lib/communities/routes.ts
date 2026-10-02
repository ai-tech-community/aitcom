/**
 * Community destinations that more than one place links to. Locale-less:
 * pass them to the i18n `Link` / router, which adds the locale.
 */

export function communityHref(slug: string): string {
  return `/communities/${slug}`;
}

export function communitySettingsHref(slug: string): string {
  return `/communities/${slug}/settings`;
}

/** Member settings, where organizers approve join requests. */
export function communityMemberSettingsHref(slug: string): string {
  return `/communities/${slug}/settings/members`;
}
