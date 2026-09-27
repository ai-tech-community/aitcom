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

import { HomeSponsors } from "./home-sponsors";
import type { HomeSponsor } from "./home-sponsor";

const ACME: HomeSponsor = {
  id: 1,
  name: "Acme",
  href: "https://acme.ai/",
  logoUrl: "/media/acme.png",
};
const BETA: HomeSponsor = { id: 2, name: "Beta", href: null, logoUrl: null };
const GAMMA: HomeSponsor = {
  id: 3,
  name: "Gamma",
  href: "https://gamma.dev/",
  logoUrl: null,
};

function renderIn(sponsors: HomeSponsor[], locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <HomeSponsors sponsors={sponsors} />
    </NextIntlClientProvider>,
  );
}

function section() {
  return screen.getByRole("region", { name: en.homeSponsors.title });
}

describe("HomeSponsors", () => {
  it("names one or two sponsors in a plain sentence, not a logo row", () => {
    renderIn([GAMMA, BETA]);
    const s = section();
    expect(s.textContent).toContain(
      "AIT Community is supported by Gamma and Beta.",
    );
    expect(within(s).queryByRole("list")).toBeNull();
    // Full strength: no faded logos.
    expect(s.innerHTML).not.toMatch(/opacity-/);
  });

  it("writes the sentence in Dutch", () => {
    renderIn([GAMMA, BETA], "nl");
    expect(
      screen.getByRole("region", { name: nl.homeSponsors.title }).textContent,
    ).toContain("AIT Community wordt gesteund door Gamma en Beta.");
  });

  it("shows a sponsor's logo in the sentence, named by its alt text", () => {
    renderIn([ACME]);
    const link = screen.getByRole("link", { name: "Acme" });
    expect(
      within(link).getByRole("img", { name: "Acme" }).getAttribute("src"),
    ).toContain(encodeURIComponent("/media/acme.png"));
    expect(section().textContent).not.toMatch(/Acme/);
  });

  it("links a sponsor only when it has a website, never to #", () => {
    renderIn([ACME, BETA]);
    const acme = screen.getByRole("link", { name: /Acme/ });
    expect(acme).toHaveAttribute("href", "https://acme.ai/");
    expect(acme).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByRole("link", { name: /Beta/ })).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toBe("#");
    }
  });

  it("shows three or more sponsors as an aligned row", () => {
    renderIn([ACME, BETA, GAMMA]);
    const items = within(section()).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByRole("img", { name: "Acme" })).toBeTruthy();
    expect(items[1]!.textContent).toBe("Beta");
    expect(within(items[1]!).queryByRole("link")).toBeNull();
    expect(within(items[2]!).getByRole("link")).toHaveAttribute(
      "href",
      "https://gamma.dev/",
    );
    expect(section().textContent).not.toContain(en.homeSponsors.supportedBy);
  });

  it("stays honest with no sponsors", () => {
    renderIn([]);
    expect(section().textContent).toContain(en.homeSponsors.none);
  });

  it.each([[[]], [[ACME]], [[ACME, BETA, GAMMA]]])(
    "always offers a quiet, 24px-tall become-a-sponsor link",
    (sponsors) => {
      renderIn(sponsors);
      const become = screen.getByRole("link", {
        name: en.homeSponsors.become,
      });
      expect(become).toHaveAttribute("href", "/sponsors");
      expect(become).toHaveAttribute("data-slot", "more-link");
      expect(become.className).toMatch(/\bmin-h-6\b/);
    },
  );

  it("sits under its own heading, not a sponsor pitch", () => {
    renderIn([ACME]);
    const headings = within(section()).getAllByRole("heading");
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveAttribute("data-slot", "section-label");
  });
});
