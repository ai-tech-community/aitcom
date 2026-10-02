/**
 * The member profile's tabs and their routes. Locale-less: pass them to the
 * i18n `Link`, which adds the locale.
 */
export const PROFILE_TABS = [
  "overview",
  "badges",
  "activity",
  "work",
  "agent",
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number];

/** The URL of one tab of a member's profile; Overview is the profile root. */
export function profileTabHref(userId: string, tab: ProfileTab): string {
  const root = `/members/${userId}`;
  return tab === "overview" ? root : `${root}/${tab}`;
}
