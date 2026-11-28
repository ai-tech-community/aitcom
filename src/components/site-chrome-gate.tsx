"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSelectedLayoutSegments } from "next/navigation";
import { Toaster } from "sonner";
import { usePathname } from "@/i18n/navigation";
import { isWorkspacePath } from "@/lib/communities/layout-variant";
import { ShellUnreadProvider } from "@/components/shells/shell-unread";
import { isMagazineReadingPath } from "@/lib/magazines/typography";
import { ShellMain } from "./page-main";

export type SiteShell = "community" | "hub" | "magazine" | "focus";

/** Use the matched family, so the localized catch-all keeps its Hub frame. */
export function resolveSiteShell(
  pathname: string,
  segments: readonly string[],
  recovery = false,
): SiteShell {
  const [family] = routeSegments(segments);
  const community = isCommunityRoute(segments);

  if (community && recovery) return "hub";

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

function routeSegments(segments: readonly string[]) {
  return segments.filter((segment) => !segment.startsWith("("));
}

function isCommunityRoute(segments: readonly string[]) {
  const [family, slug] = routeSegments(segments);
  return family === "communities" && slug !== undefined;
}

type ShellRoute = { shell: SiteShell; community: boolean };
const SiteShellContext = createContext<ShellRoute | null>(null);
const HubChromeContext = createContext<ReactNode>(null);

function SiteFrame({
  route,
  children,
}: {
  route: ShellRoute;
  children: ReactNode;
}) {
  return (
    <SiteShellContext.Provider value={route}>
      <div data-site-frame={route.shell} className="contents">
        {children}
      </div>
    </SiteShellContext.Provider>
  );
}

export function SiteShellProvider({
  children,
  hubChrome,
}: {
  children: ReactNode;
  hubChrome?: ReactNode;
}) {
  const segments = useSelectedLayoutSegments();
  const shell = resolveSiteShell(usePathname(), segments);

  return (
    <HubChromeContext.Provider value={hubChrome}>
      <SiteFrame route={{ shell, community: isCommunityRoute(segments) }}>
        <ShellUnreadProvider active={shell === "community" || shell === "hub"}>
          {children}
        </ShellUnreadProvider>
      </SiteFrame>
    </HubChromeContext.Provider>
  );
}

export function useSiteShell() {
  return useContext(SiteShellContext)?.shell ?? null;
}

export function useCommunityShellRoute() {
  return useContext(SiteShellContext)?.community ?? false;
}

export function SiteHubChrome() {
  const chrome = useContext(HubChromeContext);
  return <SiteChromeGate slot="hub">{chrome}</SiteChromeGate>;
}

/** The locale boundary takes over when the community layout cannot render. */
export function SiteRecovery({ children }: { children: ReactNode }) {
  const route = useContext(SiteShellContext);
  const segments = useSelectedLayoutSegments();
  const pathname = usePathname();
  if (!route?.community) return children;

  const shell = resolveSiteShell(pathname, segments, true);
  const frame = (
    <SiteFrame route={{ shell, community: false }}>
      <SiteHubChrome />
      <SiteContent>{children}</SiteContent>
    </SiteFrame>
  );
  return route.shell === "focus" ? (
    <ShellUnreadProvider active>{frame}</ShellUnreadProvider>
  ) : (
    frame
  );
}

export function SiteToaster() {
  const shell = useSiteShell();
  const hasMobileBar = shell === "community" || shell === "hub";
  return (
    <Toaster
      position="bottom-right"
      offset={
        hasMobileBar
          ? "max(60px, calc(var(--community-mobile-bar-height) + 12px))"
          : 60
      }
      mobileOffset={
        hasMobileBar
          ? { bottom: "calc(var(--community-mobile-bar-height) + 12px)" }
          : undefined
      }
    />
  );
}

export function SiteContent({ children }: { children: ReactNode }) {
  const route = useContext(SiteShellContext);
  if (!route) return <main className="flex-1">{children}</main>;
  // Community and its workspaces own the content landmark. A locale fallback
  // uses SiteRecovery when that layout cannot mount.
  if (route.community) return children;
  const shell = route.shell;
  const hub = shell === "hub";
  return (
    <ShellMain
      data-site-shell={shell}
      id={hub ? "shell-content" : undefined}
      tabIndex={hub ? -1 : undefined}
      className={
        hub
          ? "flex-1 scroll-mt-14 pb-(--shell-bottom-offset) focus:outline-none"
          : "flex-1"
      }
    >
      {children}
    </ShellMain>
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
