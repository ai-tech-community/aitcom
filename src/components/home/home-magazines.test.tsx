import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";
import type { MagazineCard } from "@/server/magazines/reading";
import { HomeMagazines } from "./home-magazines";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

export const magazine: MagazineCard = {
  id: 1,
  name: "Builders Journal",
  slug: "builders",
  description: null,
  logoUrl: null,
  topics: [],
  staffHidden: false,
  community: { name: "AIT Community", slug: "ait" },
  latest: {
    id: 10,
    number: 2,
    title: "Making useful agents",
    slug: "useful-agents",
    coverImageUrl: null,
    publishedAt: "2026-10-20T12:00:00Z",
    status: "published",
    visibility: "public",
    effectiveVisibility: "public",
    outsiderReach: "full",
    magazine: { name: "Builders Journal", slug: "builders", logoUrl: null },
    community: { name: "AIT Community", slug: "ait" },
  },
};

function show(magazines: MagazineCard[], locale: "en" | "nl" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      timeZone="Europe/Amsterdam"
      messages={locale === "en" ? en : nl}
    >
      <HomeMagazines magazines={magazines} />
    </NextIntlClientProvider>,
  );
}

describe("HomeMagazines", () => {
  it("links straight to the readable issue, identifies its magazine and host", () => {
    show([magazine]);
    expect(
      screen.getByRole("link", {
        name: /Builders Journal.*Making useful agents/,
      }),
    ).toHaveAttribute("href", "/magazines/builders/useful-agents");
    expect(screen.getByText("AIT Community")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.homeDiscovery.allMagazines }),
    ).toHaveAttribute("href", "/magazines");
  });
  it("shows at most four magazines", () => {
    show(Array.from({ length: 6 }, (_, id) => ({ ...magazine, id })));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
  it("does not create an empty shelf", () => {
    expect(show([]).container).toBeEmptyDOMElement();
  });
  it("localizes the shelf in Dutch", () => {
    show([magazine], "nl");
    expect(
      screen.getByRole("region", { name: nl.homeDiscovery.magazines }),
    ).toBeInTheDocument();
  });
});
