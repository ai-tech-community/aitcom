import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const pathname = vi.hoisted(() => ({ current: "/dashboard" }));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathname.current,
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { DashboardTabs } from "./dashboard-tabs";

function renderTabs() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DashboardTabs />
    </NextIntlClientProvider>,
  );
}

const tabs = en.dashboard.tabs;

describe("DashboardTabs", () => {
  beforeEach(() => {
    pathname.current = "/dashboard";
  });

  it("links every tab to its route, in order", () => {
    renderTabs();
    const nav = screen.getByRole("navigation", {
      name: en.dashboard.tabsLabel,
    });
    const links = Array.from(nav.querySelectorAll("a")).map((a) => [
      a.textContent,
      a.getAttribute("href"),
    ]);
    expect(links).toEqual([
      [tabs.home, "/dashboard"],
      [tabs.communities, "/dashboard/communities"],
      [tabs.events, "/dashboard/events"],
      [tabs.jobs, "/dashboard/jobs"],
      [tabs.notifications, "/dashboard/notifications"],
      [tabs.settings, "/dashboard/settings"],
    ]);
  });

  it("marks Home as the current page on /dashboard", () => {
    renderTabs();
    expect(screen.getByRole("link", { name: tabs.home })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: tabs.events })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("marks only the matching tab on a nested route, never Home", () => {
    pathname.current = "/dashboard/events";
    renderTabs();
    expect(screen.getByRole("link", { name: tabs.events })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: tabs.home })).not.toHaveAttribute(
      "aria-current",
    );
    expect(
      screen
        .getAllByRole("link")
        .filter((link) => link.getAttribute("aria-current") === "page"),
    ).toHaveLength(1);
  });

  it("keeps Notifications current on its own route", () => {
    pathname.current = "/dashboard/notifications";
    renderTabs();
    expect(
      screen.getByRole("link", { name: tabs.notifications }),
    ).toHaveAttribute("aria-current", "page");
  });
});
