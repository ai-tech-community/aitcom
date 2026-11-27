import { useId, type ReactNode } from "react";

/** Every cover is drawn on this canvas and cropped to its box. */
export const COVER_WIDTH = 1400;
export const COVER_HEIGHT = 200;

/**
 * A palette role's color. Covers draw only with
 * `var(--community-cover-<role>)`, which `CommunityThemeScope` or
 * `CommunityCoverArt` sets from the look's cover palette, so the catalog
 * test measures every color the art shows. Each cover narrows `role` to
 * its own roles: `const paint: (role: Role) => string = coverPaint`.
 */
export function coverPaint(role: string): string {
  return `var(--community-cover-${role})`;
}

/** A document-unique id for a cover's gradient, safe in `url(#…)`. */
export function useCoverId(name: string): string {
  return `cover-${name}-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
}

/**
 * The frame every cover shares: one 1400×200 drawing that fills its
 * positioned box, anchored at the bottom (where the community name sits)
 * and cropped at the sides, hidden from assistive tech (the art is
 * decorative) and out of the tab order.
 */
export function CoverSvg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox={`0 0 ${COVER_WIDTH} ${COVER_HEIGHT}`}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
      className="absolute inset-0 size-full"
    >
      {children}
    </svg>
  );
}
