import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider, useLocale } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import fr from "../../../messages/fr.json";
import NotFound from "@/app/[locale]/not-found";
import { MagazineMembersOnly } from "@/components/magazines/reading/members-only";

const catalogues = { en, nl, fr };
type Locale = keyof typeof catalogues;

vi.mock("next-intl/server", () => ({
  getTranslations: async ({
    locale,
    namespace,
  }: {
    locale: Locale;
    namespace: string;
  }) =>
    createTranslator({
      locale,
      messages: catalogues[locale],
      namespace: namespace as never,
    }),
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/missing",
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string | { pathname: string; query: Record<string, string> };
    children: React.ReactNode;
  }) => {
    const locale = useLocale();
    const path =
      typeof href === "string"
        ? href
        : `${href.pathname}?${new URLSearchParams(href.query)}`;
    return (
      <a {...props} href={`/${locale}${path}`}>
        {children}
      </a>
    );
  },
}));

function show(element: React.ReactNode, locale: Locale) {
  return render(
    <NextIntlClientProvider locale={locale} messages={catalogues[locale]}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("page recovery", () => {
  it.each(["en", "nl", "fr"] as const)(
    "offers home and magazine recovery links in %s",
    (locale) => {
      show(<NotFound />, locale);
      const copy = catalogues[locale].notFound;
      expect(
        screen.getByRole("heading", { level: 1, name: copy.title }),
      ).toBeVisible();
      expect(screen.getByRole("link", { name: copy.home })).toHaveAttribute(
        "href",
        `/${locale}/`,
      );
      expect(
        screen.getByRole("link", { name: copy.magazines }),
      ).toHaveAttribute("href", `/${locale}/magazines`);
    },
  );

  it.each(["en", "nl", "fr"] as const)(
    "lets guests sign in and return to the exact reading URL in %s",
    async (locale) => {
      const returnPath = `/${locale}/magazines/connect-inspire/issue-1/article`;
      show(
        await MagazineMembersOnly({
          locale,
          signedIn: false,
          communitySlug: "connect",
          returnPath,
        }),
        locale,
      );
      const copy = catalogues[locale].magazines.access;
      expect(
        screen.getByRole("heading", { name: copy.membersOnlyTitle }),
      ).toBeVisible();
      const signIn = screen.getByRole("link", { name: copy.signIn });
      const target = new URL(
        signIn.getAttribute("href")!,
        "https://example.test",
      );
      expect(target.pathname).toBe(`/${locale}/auth/signin`);
      expect(target.searchParams.get("redirect")).toBe(returnPath);
      expect(
        screen.getByRole("link", { name: copy.viewCommunity }),
      ).toHaveAttribute("href", `/${locale}/communities/connect`);
      expect(
        screen.getByRole("link", { name: copy.browseMagazines }),
      ).toHaveAttribute("href", `/${locale}/magazines`);
      expect(screen.queryByText("404")).not.toBeInTheDocument();
    },
  );

  it("gives signed-in nonmembers a community action and explains the membership requirement", async () => {
    show(
      await MagazineMembersOnly({
        locale: "en",
        signedIn: true,
        communitySlug: "connect",
        returnPath: "/en/magazines/connect/issue",
      }),
      "en",
    );
    expect(
      screen.getByText(en.magazines.access.memberDescription),
    ).toBeVisible();
    expect(
      screen.queryByRole("link", { name: en.magazines.access.signIn }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.magazines.access.viewCommunity }),
    ).toBeVisible();
  });
});
