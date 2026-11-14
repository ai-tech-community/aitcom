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
 * How much of the community's identity the standard frame's rail shows. The
 * tagline, member count and join control help someone decide to join, so a
 * visitor sees them on every page. A member is already in: the rail shows
 * one row of logo, name, role and their community menu (Leave lives there),
 * so the whole tab list stays in view on every page, the Overview included.
 */
export type CommunityIdentityDensity = "full" | "compact";

export function resolveCommunityIdentityDensity(
  isMember: boolean,
): CommunityIdentityDensity {
  return isMember ? "compact" : "full";
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
