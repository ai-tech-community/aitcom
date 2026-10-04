import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
  };
});
vi.mock("@/server/collectors/flags", () => ({ collectorsEnabled: () => true }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard/collectors/runs",
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { MemberDashboardFrame } from "./member-dashboard-frame";

describe("MemberDashboardFrame", () => {
  it("greets the member, shows the tabs, then the content", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        {await MemberDashboardFrame({ name: "Ada", children: <p>Tab content</p> })}
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      en.dashboard.greeting.replace("{name}", "Ada"),
    );
    const tabs = screen.getByRole("navigation", { name: en.dashboard.tabsLabel });
    expect(
      screen.getByRole("link", { name: en.dashboard.tabs.collectors }),
    ).toHaveAttribute("aria-current", "page");
    expect(tabs).toBeInTheDocument();
    expect(screen.getByText("Tab content")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
