/**
 * The Find a match page's open tab as a URL search param (`?tab=profile`), so
 * a tab survives refresh and can be shared or linked to. Owners and admins
 * open on Matches; members open on their profile, the one tab they may use.
 * The viewer's default tab has no param. A tab the viewer may not open falls
 * back to their default, so a shared link never shows an empty tab panel.
 *
 * Plain TS on purpose: the People server page imports
 * `matchingRedirectFromPeople` to send old `/members?tab=…` links here.
 */

export const MATCHING_TABS = ["matches", "profile", "introductions"] as const;

export type MatchingTab = (typeof MATCHING_TABS)[number];

const TAB_PARAM = "tab";
const ORGANIZER_TABS: ReadonlySet<MatchingTab> = new Set([
  "matches",
  "introductions",
]);

type ParamReader = { get(key: string): string | null };

export function isMatchingTab(value: string | null): value is MatchingTab {
  return (MATCHING_TABS as readonly (string | null)[]).includes(value);
}

/** Whether a viewer with `canManage` may open `tab`. */
export function canOpenMatchingTab(
  tab: MatchingTab,
  canManage: boolean,
): boolean {
  return canManage || !ORGANIZER_TABS.has(tab);
}

/** Matches for owners and admins, My matching profile for members. */
export function defaultMatchingTab(canManage: boolean): MatchingTab {
  return canManage ? "matches" : "profile";
}

/** Reads the open tab, falling back to the default for any tab the viewer may not open. */
export function parseMatchingTab(
  params: ParamReader,
  canManage: boolean,
): MatchingTab {
  const tab = params.get(TAB_PARAM);
  return isMatchingTab(tab) && canOpenMatchingTab(tab, canManage)
    ? tab
    : defaultMatchingTab(canManage);
}

/** Writes `tab` into a copy of `search`; the viewer's default tab removes the param. */
export function writeMatchingTab(
  search: URLSearchParams,
  tab: MatchingTab,
  canManage: boolean,
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (tab === defaultMatchingTab(canManage)) next.delete(TAB_PARAM);
  else next.set(TAB_PARAM, tab);
  return next;
}

/**
 * The query to open on Find a match for an old People link that named a
 * matching tab (`/members?tab=profile`), keeping every other param; `null`
 * when the link belongs on People.
 */
export function matchingRedirectFromPeople(
  search: URLSearchParams,
): URLSearchParams | null {
  return isMatchingTab(search.get(TAB_PARAM))
    ? new URLSearchParams(search)
    : null;
}
