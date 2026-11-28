"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

/**
 * The current pathname, readable from a stable callback. It is updated in a
 * layout effect, so a passive effect of the same commit (a page asking for
 * a dialog as it mounts after a navigation) already reads the new page.
 */
export function usePathnameRef(): RefObject<string | null> {
  const pathname = usePathname();
  const ref = useRef<string | null>(pathname);
  useLayoutEffect(() => {
    ref.current = pathname;
  }, [pathname]);
  return ref;
}
