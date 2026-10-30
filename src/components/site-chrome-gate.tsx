"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { isMagazineReadingPath } from "@/lib/magazines/typography";

/** A publication supplies its own navigation; discovery keeps the site frame. */
export function SiteChromeGate({ children }: { children: ReactNode }) {
  return isMagazineReadingPath(usePathname()) ? null : children;
}
