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

const EXPECTED: Record<string, string> = {
  gather: "/communities",
  build: "/challenges",
  work: "/jobs",
  learn: "/blog",
};

/** Every place the section used to list; each must stay in the navigation. */
const FORMER_LINKS = [
  "/communities",
  "/events",
  "/members",
  "/challenges",
  "/launchpad",
  "/ideas",
  "/agents",
  "/roles",
  "/jobs",
  "/startups",
  "/benchmark",
  "/investigations",
  "/blog",
  "/impact",
];

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

  it("gives each of the four groups one sentence and one link", () => {
    renderIn("en");
    const titles: Record<string, string> = Object.fromEntries(
      Object.entries(en.whatWeDo.groups).map(([k, g]) => [k, g.title]),
    );
    expect(screen.getAllByRole("article")).toHaveLength(4);
    for (const [key, href] of Object.entries(EXPECTED)) {
      const group = screen.getByRole("article", { name: titles[key] });
      const links = within(group).getAllByRole("link");
      expect(links.map((a) => a.getAttribute("href"))).toEqual([href]);
      expect(group.querySelectorAll("p")).toHaveLength(1);
    }
  });

  it("names the link in the reader's language", () => {
    renderIn("nl");
    const link = screen.getByRole("link", {
      name: nl.whatWeDo.groups.learn.link,
    });
    expect(link).toHaveAttribute("href", "/blog");
  });

  it("gives every link a target at least 24px tall", () => {
    renderIn("en");
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toMatch(/\bmin-h-6\b/);
      expect(link.className).toMatch(/\binline-flex\b/);
    }
  });

  it("shows the vignettes only from lg up", () => {
    renderIn("en");
    for (const key of Object.keys(EXPECTED)) {
      const art = screen.getByTestId(`vignette-${key}`);
      expect(art.className).toMatch(/(^|\s)hidden(\s|$)/);
      expect(art.className).toMatch(/\blg:block\b/);
    }
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
        expect(g.link).toBeTruthy();
        // One sentence per group.
        expect(g.description.match(/[.!?](\s|$)/g)).toHaveLength(1);
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
      expect(navbar).toContain(`href: "${group.href}"`);
    }
  });

  it("keeps every page it no longer lists reachable from the navigation", () => {
    const navbar = readFileSync(
      join(process.cwd(), "src/components/navbar.tsx"),
      "utf8",
    );
    for (const href of FORMER_LINKS) {
      expect(navbar, href).toContain(`href: "${href}"`);
    }
  });
});
