import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../../messages/en.json";
import nl from "../../../../messages/nl.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { WhatWeDo } from "./what-we-do";
import { WHAT_WE_DO_GROUPS } from "./groups";

const EXPECTED: Record<string, string[]> = {
  gather: ["/communities", "/events", "/members"],
  build: ["/challenges", "/launchpad", "/ideas", "/agents"],
  work: ["/roles", "/jobs", "/startups"],
  learn: ["/benchmark", "/investigations", "/blog", "/impact"],
};

function renderIn(locale: "en" | "nl") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <WhatWeDo />
    </NextIntlClientProvider>,
  );
}

describe("WhatWeDo", () => {
  it("uses the house kicker once and a heading per group", () => {
    renderIn("en");
    const section = screen.getByRole("region", { name: "What we do" });
    expect(within(section).getAllByRole("heading", { level: 2 })).toHaveLength(
      1,
    );
    expect(
      within(section)
        .getAllByRole("heading", { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(["Gather", "Build", "Work", "Learn"]);
    expect(section.textContent).not.toMatch(/FIG\./);
  });

  it("links every group to its destinations, in order", () => {
    renderIn("en");
    for (const [key, hrefs] of Object.entries(EXPECTED)) {
      const titles: Record<string, string> = Object.fromEntries(
        Object.entries(en.whatWeDo.groups).map(([k, g]) => [k, g.title]),
      );
      const group = screen.getByRole("article", { name: titles[key] });
      const links = within(group).getAllByRole("link");
      expect(links.map((a) => a.getAttribute("href"))).toEqual(hrefs);
    }
  });

  it("names each link like the navigation does, with a hint", () => {
    renderIn("nl");
    const link = screen.getByRole("link", { name: /Onderzoeken/ });
    expect(link).toHaveAttribute("href", "/investigations");
    expect(link.textContent).toContain(
      nl.whatWeDo.groups.learn.links.investigations,
    );
  });

  it("keeps the art decorative", () => {
    renderIn("en");
    for (const key of Object.keys(EXPECTED)) {
      expect(screen.getByTestId(`vignette-${key}`)).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    }
  });
});

describe("WhatWeDo — translations", () => {
  const locales = { en, nl } as const;

  it.each(Object.keys(locales) as (keyof typeof locales)[])(
    "has every key in %s",
    (locale) => {
      const m = locales[locale];
      expect(m.whatWeDo.kicker).toBeTruthy();
      for (const group of WHAT_WE_DO_GROUPS) {
        const g = m.whatWeDo.groups[group.key];
        expect(g.title).toBeTruthy();
        expect(g.description).toBeTruthy();
        for (const link of group.links) {
          expect(
            (g.links as Record<string, string>)[link.nav],
            `${locale} ${group.key}.${link.nav}`,
          ).toBeTruthy();
          expect(
            (m.nav as Record<string, string>)[link.nav],
            `${locale} nav.${link.nav}`,
          ).toBeTruthy();
        }
      }
    },
  );

  it("has the same keys in both locales", () => {
    const keys = (o: unknown, prefix = ""): string[] =>
      o && typeof o === "object"
        ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    expect(keys(nl.whatWeDo).sort()).toEqual(keys(en.whatWeDo).sort());
  });

  it("leads only to pages the navigation also offers", () => {
    const navbar = readFileSync(
      join(process.cwd(), "src/components/navbar.tsx"),
      "utf8",
    );
    for (const group of WHAT_WE_DO_GROUPS) {
      for (const link of group.links) {
        expect(navbar).toContain(`href: "${link.href}"`);
      }
    }
  });
});
