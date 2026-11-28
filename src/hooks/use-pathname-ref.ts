"use client";

import { useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

/**
 * The current pathname, readable from a stable callback. It is written
 * while the owner renders, before any effect of that commit, so even a
 * child's layout effect on a page just navigated to reads the new page.
 * The owner renders before its children, and the write is idempotent.
 */
export function usePathnameRef(): RefObject<string | null> {
  const pathname = usePathname();
  const ref = useRef<string | null>(pathname);
  ref.current = pathname;
  return ref;
}
