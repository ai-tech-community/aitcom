import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/components/magazines/test-intl";

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
});
