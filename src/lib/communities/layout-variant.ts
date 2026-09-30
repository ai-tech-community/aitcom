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
];

export function resolveCommunityLayoutVariant(
  segments: string[],
): CommunityLayoutVariant {
  const path = segments.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  const match = WORKSPACE_ROUTES.some(
    (pattern) =>
      pattern.length === path.length &&
      pattern.every((p, i) => p === null || p === path[i]),
  );
  return match ? "workspace" : "standard";
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
