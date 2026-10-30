/**
 * Pure helpers for community Spaces (Slice 3, Plan 1). No DB access here — these
 * are unit-testable building blocks used by the seed mutation, the backfill
 * migration, and the nav.
 */

export const BUILTIN_SURFACES = [
  "forum",
  "events",
  "classroom",
  "ideas",
  "members",
] as const;

/** A surface every new community gets. */
export type DefaultBuiltinSurface = (typeof BUILTIN_SURFACES)[number];

/**
 * Builtin surfaces a community gains by turning a feature on, never by
 * default: the Magazine tab is added when the community's magazine is
 * created. Once added, they rename, hide and reorder like the defaults.
 */
export const OPTIONAL_BUILTIN_SURFACES = ["magazine"] as const;

/** Any builtin surface a space row can point at. */
export type BuiltinSurface =
  | DefaultBuiltinSurface
  | (typeof OPTIONAL_BUILTIN_SURFACES)[number];

/** Shape of a default builtin space row (pre-insert; id/createdAt are DB-filled). */
export interface DefaultSpaceRow {
  communityId: string;
  kind: "builtin";
  builtinSurface: DefaultBuiltinSurface;
  name: null;
  slug: DefaultBuiltinSurface;
  position: number;
}

/** The five default builtin spaces for a community, in canonical nav order. */
export function buildDefaultSpaceRows(communityId: string): DefaultSpaceRow[] {
  return BUILTIN_SURFACES.map((surface, position) => ({
    communityId,
    kind: "builtin" as const,
    builtinSurface: surface,
    name: null,
    slug: surface,
    position,
  }));
}

/** Minimal space shape the nav needs to compute a label. */
export interface LabelableSpace {
  kind: "builtin" | "room";
  builtinSurface: BuiltinSurface | null;
  name: string | null;
}

/**
 * Catalogue labels for a builtin surface, in every supported locale. A stored
 * `name` that matches one of these (or the surface id) is the untouched
 * default, so the nav can show the current locale instead of that string.
 * Custom names stay as written. Kept in step with `communities.profile`.
 */
const DEFAULT_BUILTIN_LABELS: Record<BuiltinSurface, readonly string[]> = {
  forum: ["Forum"],
  events: ["Events", "Événements", "Evenementen"],
  classroom: ["Classrooms", "Espaces de formation", "Klaslokalen"],
  ideas: ["Ideas", "Idées", "Ideeën"],
  members: ["Members", "Membres", "Leden"],
  magazine: ["Magazine"],
};

function normalizeSpaceName(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

/** True when a stored builtin name is still a default label, not a rename. */
export function isDefaultBuiltinLabel(
  surface: BuiltinSurface,
  name: string,
): boolean {
  const normalized = normalizeSpaceName(name);
  if (normalized === surface) return true;
  return DEFAULT_BUILTIN_LABELS[surface].some(
    (label) => normalizeSpaceName(label) === normalized,
  );
}

/**
 * Resolve the label shown in the nav. A custom `name` wins. A builtin whose
 * stored name is empty or still a default catalogue label uses the current
 * locale. Rooms always carry a `name`, so the `?? ""` fallback is not hit.
 */
export function resolveSpaceLabel(
  space: LabelableSpace,
  t: (key: BuiltinSurface) => string,
): string {
  const defaultName =
    space.kind === "builtin" &&
    space.builtinSurface !== null &&
    (space.name === null ||
      space.name.trim().length === 0 ||
      isDefaultBuiltinLabel(space.builtinSurface, space.name));
  if (!defaultName && space.name) return space.name;
  if (space.builtinSurface) return t(space.builtinSurface);
  return space.name ?? "";
}
