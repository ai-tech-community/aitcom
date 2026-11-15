/**
 * Which frame the community layout draws around a page. `workspace` pages are
 * full-screen authoring tools: no community header, no tab bar, no width cap,
 * and no site footer. Add a new workspace route here — the community layout
 * and the site footer both read only this file.
 */
export type CommunityLayoutVariant = "standard" | "workspace";

const WORKSPACE_ROUTES: ReadonlyArray<ReadonlyArray<string | null>> = [
  // classroom/<courseSlug>/edit — null matches any single segment
  ["classroom", null, "edit"],
  // The event editor: events/new and events/<eventSlug>/edit
  ["events", "new"],
  ["events", null, "edit"],
  // The issue builder: magazine/issues/<issueId>/edit
  ["magazine", "issues", null, "edit"],
];

/** Layout segments without route groups such as `(authoring)`. */
function routeSegments(segments: string[]): string[] {
  return segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
}

export function resolveCommunityLayoutVariant(
  segments: string[],
): CommunityLayoutVariant {
  const path = routeSegments(segments);
  const match = WORKSPACE_ROUTES.some(
    (pattern) =>
      pattern.length === path.length &&
      pattern.every((p, i) => p === null || p === path[i]),
  );
  return match ? "workspace" : "standard";
}

/**
 * The community's front page: the layout draws the banner across the top of
 * it (and only it), and the feed's side panel opens with the About section.
 */
export function isCommunityOverview(segments: string[]): boolean {
  return routeSegments(segments).length === 0;
}

/**
 * Routes someone who may not read the community's content still opens,
 * because they are part of getting in: the paid offers (and an offer's
 * page), gated on their own by `communityPayments`. Every other route of a
 * members-only community shows the members-only state instead.
 */
const OUTSIDER_ROUTES: ReadonlyArray<string> = ["offers"];

export function isOutsiderRoute(segments: string[]): boolean {
  const [first] = routeSegments(segments);
  return first !== undefined && OUTSIDER_ROUTES.includes(first);
}

/**
 * The same decision from a locale-free pathname (next-intl's `usePathname`),
 * for site chrome outside the community layout, such as the footer.
 */
export function isWorkspacePath(pathname: string): boolean {
  const [root, slug, ...rest] = pathname.split("/").filter(Boolean);
  if (root !== "communities" || slug === undefined) return false;
  return resolveCommunityLayoutVariant(rest) === "workspace";
}
