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

import { RouteTabs, isRouteTabActive } from "./route-tabs";

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
