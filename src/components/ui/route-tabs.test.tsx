import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ current: "/" }));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname.current,
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { RouteTabs, isRouteTabActive, readOverflow } from "./route-tabs";

const TABS = [
  {
    href: "/investigations/datacenters",
    label: "Facilities",
    match: "exact" as const,
  },
  { href: "/investigations/datacenters/red-flags", label: "Red flags" },
];

describe("isRouteTabActive", () => {
  it("matches an index tab only on its own path", () => {
    expect(isRouteTabActive("/investigations/datacenters", TABS[0]!)).toBe(
      true,
    );
    expect(
      isRouteTabActive("/investigations/datacenters/red-flags", TABS[0]!),
    ).toBe(false);
  });

  it("keeps a prefix tab active on nested routes but not on look-alike paths", () => {
    expect(
      isRouteTabActive("/investigations/datacenters/red-flags/x", TABS[1]!),
    ).toBe(true);
    expect(
      isRouteTabActive("/investigations/datacenters/red-flagsx", TABS[1]!),
    ).toBe(false);
  });
});

describe("<RouteTabs>", () => {
  it("marks only the current route with aria-current", () => {
    pathname.current = "/investigations/datacenters/red-flags";
    render(<RouteTabs aria-label="Sections" tabs={TABS} />);

    expect(screen.getByRole("navigation", { name: "Sections" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Red flags" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("link", { name: "Facilities" })
        .hasAttribute("aria-current"),
    ).toBe(false);
  });
});

describe("readOverflow", () => {
  it("reports which edges hide tabs", () => {
    expect(
      readOverflow({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 }),
    ).toEqual({ start: false, end: false });
    expect(
      readOverflow({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 }),
    ).toEqual({ start: false, end: true });
    expect(
      readOverflow({ scrollLeft: 150, scrollWidth: 600, clientWidth: 300 }),
    ).toEqual({ start: true, end: true });
    expect(
      readOverflow({ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 }),
    ).toEqual({ start: true, end: false });
  });
});

describe("<RouteTabs> overflow", () => {
  const MANY = Array.from({ length: 6 }, (_, i) => ({
    href: `/t/${i}`,
    label: `Tab ${i}`,
  }));

  function layOut() {
    // jsdom has no layout: give each tab a 100px slot in a 250px bar.
    const proto = HTMLElement.prototype;
    const spies = [
      vi.spyOn(proto, "offsetLeft", "get").mockImplementation(function (
        this: HTMLElement,
      ) {
        const index = MANY.findIndex(
          (t) => this.getAttribute("href") === t.href,
        );
        return index < 0 ? 0 : index * 100;
      }),
      vi.spyOn(proto, "offsetWidth", "get").mockReturnValue(100),
      vi.spyOn(proto, "clientWidth", "get").mockReturnValue(250),
      vi.spyOn(proto, "scrollWidth", "get").mockReturnValue(600),
    ];
    return () => spies.forEach((s) => s.mockRestore());
  }

  it("scrolls the active tab into view and fades the hidden edges", () => {
    const restore = layOut();
    pathname.current = "/t/4";
    const { container } = render(<RouteTabs aria-label="S" tabs={MANY} />);
    const nav = screen.getByRole("navigation", { name: "S" });
    // Tab 4 spans 400..500; a 250px viewport must start at 250.
    expect(nav.scrollLeft).toBe(250);
    const edges = Array.from(
      container.querySelectorAll('[data-slot="route-tabs-fade"]'),
    ).map((el) => el.getAttribute("data-edge"));
    expect(edges).toEqual(["start", "end"]);
    restore();
  });

  it("shows no fade when every tab fits", () => {
    pathname.current = "/investigations/datacenters";
    const { container } = render(<RouteTabs aria-label="S" tabs={TABS} />);
    expect(container.querySelector('[data-slot="route-tabs-fade"]')).toBeNull();
  });
});
