/**
 * Which frame the community layout draws around a page. `workspace` pages are
 * full-screen authoring tools: no community header, no tab bar, no width cap.
 * Add a new workspace route here — the layout reads only this function.
 */
export type CommunityLayoutVariant = "standard" | "workspace";

const WORKSPACE_ROUTES: ReadonlyArray<ReadonlyArray<string | null>> = [
  // classroom/<courseSlug>/edit — null matches any single segment
  ["classroom", null, "edit"],
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
