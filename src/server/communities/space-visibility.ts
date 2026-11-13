import { isNull, notInArray, or, type SQL } from "drizzle-orm";

import { spaces } from "@/server/db/schema";
import { galleryEnabled } from "@/server/gallery/flag";

import {
  ROLLOUT_GATED_SURFACES,
  type RolloutGatedSurface,
} from "./space-defaults";

/**
 * The rollout flag behind each gated surface. Typed over every gated surface,
 * so a new gated surface does not compile until its flag is named here.
 */
const SURFACE_FLAGS: Record<RolloutGatedSurface, () => boolean> = {
  gallery: galleryEnabled,
};

/** Gated surfaces whose flag is off right now. */
export function hiddenBuiltinSurfaces(): RolloutGatedSurface[] {
  return ROLLOUT_GATED_SURFACES.filter((surface) => !SURFACE_FLAGS[surface]());
}

/**
 * Where-condition for any `spaces` read that hands tabs or surfaces to a
 * client or agent: keeps rooms (no surface) and every builtin whose flag is
 * on. `undefined` when nothing is hidden; drizzle's `and()` drops it.
 */
export function visibleSpaceCondition(): SQL | undefined {
  const hidden = hiddenBuiltinSurfaces();
  if (hidden.length === 0) return undefined;
  return or(
    isNull(spaces.builtinSurface),
    notInArray(spaces.builtinSurface, hidden),
  );
}
