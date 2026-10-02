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

type Overflow = { start: boolean; end: boolean };

/**
 * Which edges of a horizontally scrolling element hide content. A 1px
 * tolerance absorbs sub-pixel rounding.
 */
export function readOverflow(el: {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}): Overflow {
  return {
    start: el.scrollLeft > 1,
    end: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
  };
}

/**
 * Scroll a tab bar so the active tab is fully visible, without moving the
 * page (scrollIntoView would also scroll the window vertically).
 */
function revealActiveTab(nav: HTMLElement) {
  const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return;
  const left = active.offsetLeft - nav.offsetLeft;
  const right = left + active.offsetWidth;
  if (left < nav.scrollLeft) nav.scrollLeft = left;
  else if (right > nav.scrollLeft + nav.clientWidth)
    nav.scrollLeft = right - nav.clientWidth;
}

/**
 * Tabs where each tab is its own route. Use instead of `<Tabs>` when a tab
 * deserves a URL: shareable, back-button friendly, and only loading its own
 * data. Renders a `<nav>` of links (not an ARIA tablist), with
 * `aria-current="page"` on the active one.
 *
 * When the tabs do not fit (phones), the bar scrolls sideways: the active tab
 * is scrolled into view on load and on navigation, and a fade on the hidden
 * edge(s) shows there is more.
 */
function RouteTabs({
  tabs,
  className,
  ...props
}: Omit<React.ComponentProps<"nav">, "children"> & { tabs: RouteTab[] }) {
  const pathname = usePathname();
  const navRef = React.useRef<HTMLElement>(null);
  const [overflow, setOverflow] = React.useState<Overflow>({
    start: false,
    end: false,
  });

  React.useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    revealActiveTab(nav);
    const update = () =>
      setOverflow((prev) => {
        const next = readOverflow(nav);
        return prev.start === next.start && prev.end === next.end ? prev : next;
      });
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(nav);
    return () => {
      nav.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [pathname]);

  return (
    <div data-slot="route-tabs-frame" className="relative">
      <nav
        ref={navRef}
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
      {overflow.start && (
        <div
          aria-hidden
          data-slot="route-tabs-fade"
          data-edge="start"
          className="from-background pointer-events-none absolute top-0 bottom-px left-0 w-8 bg-gradient-to-r to-transparent"
        />
      )}
      {overflow.end && (
        <div
          aria-hidden
          data-slot="route-tabs-fade"
          data-edge="end"
          className="from-background pointer-events-none absolute top-0 right-0 bottom-px w-8 bg-gradient-to-l to-transparent"
        />
      )}
    </div>
  );
}

export { RouteTabs };
