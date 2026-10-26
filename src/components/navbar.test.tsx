// The top navigation: every destination is a link in the menu, and each
// one-letter shortcut opens its page.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../messages/en.json";

const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/",
  useRouter: () => router,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/auth/session-provider", () => ({
  useInitialAuthUser: () => null,
}));
vi.mock("@/server/better-auth/client", () => ({
  authClient: { useSession: () => ({ data: null }), signOut: vi.fn() },
}));
vi.mock("@/server/better-auth/hub-session", () => ({
  documentAuthUser: () => null,
}));
vi.mock("./language-switcher", () => ({ LanguageSwitcher: () => null }));

import { Navbar } from "./navbar";

function renderNavbar() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Navbar />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  router.push.mockReset();
});

describe("Navbar", () => {
  it("has a Magazines link", () => {
    renderNavbar();
    fireEvent.click(
      screen.getByRole("button", { name: "Open navigation menu" }),
    );
    const menu = screen.getByRole("dialog");
    expect(
      within(menu).getByRole("link", { name: "[G] MAGAZINES" }),
    ).toHaveAttribute("href", "/magazines");
  });

  it("opens Magazines with the G shortcut", () => {
    renderNavbar();
    fireEvent.keyDown(window, { key: "g" });
    expect(router.push).toHaveBeenCalledWith("/magazines");
  });
});
