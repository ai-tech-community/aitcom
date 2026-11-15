/**
 * The People page's open tab as a URL search param (`?tab=matches`), so a
 * tab survives refresh and can be shared or linked to. The directory is the
 * default and has no param. Organizer-only tabs fall back to the directory
 * for viewers who may not open them, so a shared link never shows an empty
 * tab panel.
 */

export const MEMBERS_HUB_TABS = [
  "directory",
  "matches",
  "profile",
  "introductions",
] as const;

export type MembersHubTab = (typeof MEMBERS_HUB_TABS)[number];

const TAB_PARAM = "tab";
const DEFAULT_TAB: MembersHubTab = "directory";
const ORGANIZER_TABS: ReadonlySet<MembersHubTab> = new Set([
  "matches",
  "introductions",
]);

type ParamReader = { get(key: string): string | null };

export function isMembersHubTab(value: string | null): value is MembersHubTab {
  return (MEMBERS_HUB_TABS as readonly (string | null)[]).includes(value);
}

/** Whether a viewer with `canManage` may open `tab`. */
export function canOpenMembersHubTab(
  tab: MembersHubTab,
  canManage: boolean,
): boolean {
  return canManage || !ORGANIZER_TABS.has(tab);
}

/** Reads the open tab, falling back to the directory for any tab the viewer may not open. */
export function parseMembersHubTab(
  params: ParamReader,
  canManage: boolean,
): MembersHubTab {
  const tab = params.get(TAB_PARAM);
  return isMembersHubTab(tab) && canOpenMembersHubTab(tab, canManage)
    ? tab
    : DEFAULT_TAB;
}

/** Writes `tab` into a copy of `search`; the directory removes the param. */
export function writeMembersHubTab(
  search: URLSearchParams,
  tab: MembersHubTab,
): URLSearchParams {
  const next = new URLSearchParams(search);
  if (tab === DEFAULT_TAB) next.delete(TAB_PARAM);
  else next.set(TAB_PARAM, tab);
  return next;
}
