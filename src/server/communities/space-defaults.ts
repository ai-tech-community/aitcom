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

export type BuiltinSurface = (typeof BUILTIN_SURFACES)[number];

/** Shape of a default builtin space row (pre-insert; id/createdAt are DB-filled). */
export interface DefaultSpaceRow {
  communityId: string;
  kind: "builtin";
  builtinSurface: BuiltinSurface;
  name: null;
  slug: BuiltinSurface;
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
 * Resolve the label shown in the nav: an explicit `name` override always wins;
 * otherwise a builtin falls back to its i18n key (forum/events/...). Rooms
 * (Plan 2) always carry a `name`, so the `?? ""` fallback is never hit there.
 */
export function resolveSpaceLabel(
  space: LabelableSpace,
  t: (key: BuiltinSurface) => string,
): string {
  if (space.name) return space.name;
  if (space.builtinSurface) return t(space.builtinSurface);
  return "";
}
