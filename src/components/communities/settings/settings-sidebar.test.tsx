import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/components/magazines/test-intl";

const { redesign } = vi.hoisted(() => ({ redesign: { enabled: false } }));

vi.mock("@/lib/communities/redesign-flag", () => ({
  isOpenCommunitiesEnabled: () => redesign.enabled,
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/communities/night-owls/settings/general",
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SettingsSidebar } from "./settings-sidebar";

describe("SettingsSidebar", () => {
  it.each(["owner", "admin"] as const)(
    "opens matching settings for the %s in both navigation layouts",
    (memberRole) => {
      renderWithIntl(
        <SettingsSidebar slug="night-owls" memberRole={memberRole} />,
      );
      const links = screen.getAllByRole("link", { name: "Matching" });
      expect(links).toHaveLength(2);
      for (const link of links)
        expect(link).toHaveAttribute(
          "href",
          "/communities/night-owls/settings/matching",
        );
    },
  );
  it.each(["owner", "admin"] as const)(
    "lists Themes right after General for the %s",
    (memberRole) => {
      renderWithIntl(
        <SettingsSidebar slug="night-owls" memberRole={memberRole} />,
      );
      for (const nav of screen.getAllByRole("navigation")) {
        const links = within(nav).getAllByRole("link");
        const names = links.map((link) => link.textContent);
        expect(names.slice(0, 2)).toEqual(["General", "Themes"]);
        expect(links[1]).toHaveAttribute(
          "href",
          "/communities/night-owls/settings/themes",
        );
      }
    },
  );
  it("opens the magazine settings directly from both navigation layouts", () => {
    renderWithIntl(<SettingsSidebar slug="night-owls" memberRole="owner" />);
    const links = screen.getAllByRole("link", { name: "Magazine" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute(
        "href",
        "/communities/night-owls/magazine/settings",
      );
    }
  });
  it("surfaces Integrations among the first mobile and desktop links for owners", () => {
    redesign.enabled = true;
    try {
      const { rerender } = renderWithIntl(
        <SettingsSidebar slug="night-owls" memberRole="owner" />,
      );
      for (const nav of screen.getAllByRole("navigation")) {
        expect(within(nav).getAllByRole("link")[2]).toHaveTextContent(
          "Integrations",
        );
      }
      rerender(<SettingsSidebar slug="night-owls" memberRole="admin" />);
      expect(screen.queryByRole("link", { name: "Integrations" })).toBeNull();
    } finally {
      redesign.enabled = false;
    }
  });
  it("keeps every owner destination in the grouped navigation", () => {
    const legacy = renderWithIntl(
      <SettingsSidebar slug="night-owls" memberRole="owner" />,
    );
    const before = within(screen.getAllByRole("navigation")[0]!)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
      .sort();
    legacy.unmount();
    redesign.enabled = true;
    try {
      renderWithIntl(<SettingsSidebar slug="night-owls" memberRole="owner" />);
      const nav = screen.getByRole("navigation", {
        name: "Community settings",
      });
      expect(within(nav).getAllByRole("heading")).toHaveLength(4);
      expect(
        within(nav)
          .getAllByRole("link")
          .map((link) => link.getAttribute("href"))
          .sort(),
      ).toEqual(before);
      expect(
        within(nav).getByRole("link", { name: "General" }),
      ).toHaveAttribute("aria-current", "page");
    } finally {
      redesign.enabled = false;
    }
  });
});
