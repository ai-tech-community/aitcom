"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";
import { isWorkspacePath } from "@/lib/communities/layout-variant";

/**
 * Leaves the site footer off full-height workspace pages (the course
 * builder), where it would sit under the workspace. Which pages are
 * workspaces is decided in one place: src/lib/communities/layout-variant.ts.
 */
export function FooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return isWorkspacePath(pathname) ? null : children;
}
