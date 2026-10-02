import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

const pathname = vi.hoisted(() => ({ current: "/members/u1" }));

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

import { isRouteTabActive } from "@/components/ui/route-tabs";

import { ProfileTabs, profileTabs } from "./profile-tabs";

describe("profileTabs", () => {
  it("lists every tab in order when the viewer may see the agent", () => {
    expect(profileTabs("u1", { showAgent: true })).toEqual([
      { tab: "overview", href: "/members/u1", match: "exact" },
      { tab: "badges", href: "/members/u1/badges" },
      { tab: "activity", href: "/members/u1/activity" },
      { tab: "work", href: "/members/u1/work" },
      { tab: "agent", href: "/members/u1/agent" },
    ]);
  });

  it("leaves out the Agent tab otherwise", () => {
    expect(
      profileTabs("u1", { showAgent: false }).map((t) => t.tab),
    ).not.toContain("agent");
  });

  it("keeps Overview inactive on the other tabs", () => {
    const [overview, badges] = profileTabs("u1", { showAgent: false }).map(
      (tab) => ({ ...tab, label: tab.tab }),
    );
    expect(isRouteTabActive("/members/u1/badges", overview!)).toBe(false);
    expect(isRouteTabActive("/members/u1", overview!)).toBe(true);
    expect(isRouteTabActive("/members/u1/badges", badges!)).toBe(true);
  });
});

describe("ProfileTabs", () => {
  it.each([
    ["en", en, ["Overview", "Badges", "Activity", "Work", "Agent"]],
    ["nl", nl, ["Overzicht", "Badges", "Activiteit", "Werk", "Agent"]],
  ] as const)(
    "names the tabs in %s and marks the current one",
    (locale, messages, labels) => {
      pathname.current = "/members/u1/work";
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ProfileTabs userId="u1" showAgent />
        </NextIntlClientProvider>,
      );
      const links = screen.getAllByRole("link");
      expect(links.map((l) => l.textContent)).toEqual([...labels]);
      expect(
        links.filter((l) => l.getAttribute("aria-current") === "page"),
      ).toHaveLength(1);
      expect(links[3]).toHaveAttribute("aria-current", "page");
    },
  );
});
