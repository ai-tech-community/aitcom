"use client";

import * as React from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type RouteTab = {
  href: string;
  label: React.ReactNode;
  /**
   * `exact` for an index tab whose path prefixes its siblings; `prefix` (default)
   * keeps a tab active on its nested routes.
   */
  match?: "exact" | "prefix";
};

export function isRouteTabActive(pathname: string, tab: RouteTab): boolean {
  if (tab.match === "exact") return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/**
 * Tabs where each tab is its own route. Use instead of `<Tabs>` when a tab
 * deserves a URL: shareable, back-button friendly, and only loading its own
 * data. Renders a `<nav>` of links (not an ARIA tablist), with
 * `aria-current="page"` on the active one.
 */
function RouteTabs({
  tabs,
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "children"> & { tabs: RouteTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      data-slot="route-tabs"
      className={cn(
        "border-border flex gap-1 overflow-x-auto border-b [scrollbar-width:none]",
        className,
      )}
      {...props}
    >
      {tabs.map((tab) => {
        const active = isRouteTabActive(pathname, tab);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "focus-visible:ring-ring/50 -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px]",
              active
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { RouteTabs };
