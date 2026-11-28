"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { Toaster } from "sonner";
import { usePathname } from "@/i18n/navigation";
import { isWorkspacePath } from "@/lib/communities/layout-variant";
import { isMagazineReadingPath } from "@/lib/magazines/typography";

export type SiteShell = "community" | "hub" | "magazine" | "focus";

/** Use the matched family, so the localized catch-all keeps its Hub frame. */
export function resolveSiteShell(
  pathname: string,
  segments: readonly string[],
): SiteShell {
  const [family, slug] = segments.filter((segment) => !segment.startsWith("("));
  const community = family === "communities" && slug !== undefined;

  if (
    (community && isWorkspacePath(pathname)) ||
    family === "og" ||
    (family === "members" &&
      /^\/members\/[^/]+\/badges\/[^/]+\/image\/?$/.test(pathname))
  ) {
    return "focus";
  }
  if (family === "magazines" && isMagazineReadingPath(pathname)) {
    return "magazine";
  }
  return community ? "community" : "hub";
}

const SiteShellContext = createContext<SiteShell | null>(null);

export function SiteShellProvider({ children }: { children: ReactNode }) {
  const segments = useSelectedLayoutSegments();
  const shell = resolveSiteShell(usePathname(), segments);

  return (
    <SiteShellContext.Provider value={shell}>
      {children}
    </SiteShellContext.Provider>
  );
}

export function useSiteShell() {
  return useContext(SiteShellContext);
}

export function SiteToaster() {
  const community = useSiteShell() === "community";
  return (
    <Toaster
      position="bottom-right"
      offset={
        community
          ? "max(60px, calc(var(--community-mobile-bar-height) + 12px))"
          : 60
      }
      mobileOffset={
        community
          ? { bottom: "calc(var(--community-mobile-bar-height) + 12px)" }
          : undefined
      }
    />
  );
}

export function SiteContent({ children }: { children: ReactNode }) {
  const shell = useSiteShell();
  const hub = shell === "hub";
  return (
    <main
      data-site-shell={shell ?? undefined}
      id={hub ? "shell-content" : undefined}
      tabIndex={hub ? -1 : undefined}
      className={hub ? "flex-1 scroll-mt-14 focus:outline-none" : "flex-1"}
    >
      {children}
    </main>
  );
}

export function SiteChromeGate({
  children,
  slot = "legacy",
}: {
  children: ReactNode;
  slot?: "legacy" | "hub" | "footer" | "session";
}) {
  const shell = useSiteShell();
  const pathname = usePathname();

  if (!shell) {
    return slot !== "hub" && !isMagazineReadingPath(pathname) ? children : null;
  }
  if (slot === "hub") return shell === "hub" ? children : null;
  if (slot === "legacy") return null;
  return shell === "community" || shell === "hub" ? children : null;
}
