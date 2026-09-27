import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

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

import { HOME_SECTION_ORDER, HomeSections } from "./home-sections";
import type { HomeSectionsProps } from "./home-sections";
import type { EventRowInput } from "@/components/home/event-rows/event-rows";

const NOW = new Date("2026-09-27T10:00:00.000Z");

const UPCOMING: EventRowInput = {
  id: 1,
  slug: "agents-hackathon",
  title: "Build With Agents Hackathon",
  type: "hackathon",
  date: "2026-10-10T00:00:00.000Z",
  startTime: "10:00",
  timezone: "Europe/Amsterdam",
  city: "Utrecht",
  country: "Netherlands",
  host: "AIT Community Netherlands",
};
const PAST: EventRowInput = {
  ...UPCOMING,
  id: 2,
  slug: "summer-build-weekend",
  title: "Summer build weekend",
  date: "2026-08-22T00:00:00.000Z",
};

const FULL: HomeSectionsProps = {
  featuredCommunities: [
    {
      id: "nl",
      slug: "ait-community-netherlands",
      name: "AIT Community Netherlands",
      description: "The Dutch AIT chapter.",
      logoUrl: null,
      memberCount: 4,
    },
  ],
  upcomingEvents: [UPCOMING],
  recentEvents: [PAST],
  sponsors: [
    { id: 1, name: "Acme", href: "https://acme.ai/", logoUrl: null },
    { id: 2, name: "Beta", href: null, logoUrl: null },
  ],
  signedIn: false,
  now: NOW,
};

beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function renderIn(
  props: Partial<HomeSectionsProps> = {},
  locale: "en" | "nl" = "en",
) {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : nl}
    >
      <HomeSections {...FULL} {...props} />
    </NextIntlClientProvider>,
  );
}

function renderedOrder(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>("[data-section]")]
    .filter((wrapper) => wrapper.childElementCount > 0)
    .map((wrapper) => wrapper.dataset.section!);
}

describe("HomeSections", () => {
  it("renders communities → events → start → what we do → proof → sponsors → closing square", () => {
    const { container } = renderIn();
    expect(renderedOrder(container)).toEqual([...HOME_SECTION_ORDER]);
    expect(HOME_SECTION_ORDER).toEqual([
      "featured-communities",
      "upcoming-events",
      "start-here",
      "what-we-do",
      "recent-gatherings",
      "sponsors",
      "closing-square",
    ]);
  });

  it("puts upcoming events straight under featured communities", () => {
    const { container } = renderIn();
    const order = renderedOrder(container);
    expect(order.indexOf("upcoming-events")).toBe(
      order.indexOf("featured-communities") + 1,
    );
  });

  it("wrappers add no box, so an empty section leaves no gap", () => {
    const { container } = renderIn({
      featuredCommunities: [],
      recentEvents: [],
      signedIn: true,
    });
    for (const wrapper of container.querySelectorAll("[data-section]")) {
      expect(wrapper).toHaveClass("contents");
    }
    expect(renderedOrder(container)).toEqual([
      "upcoming-events",
      "what-we-do",
      "sponsors",
      "closing-square",
    ]);
  });

  it("ends on the town square with the hero's actions, not the old CTA cards", () => {
    const { container } = renderIn();
    const wrappers = container.querySelectorAll<HTMLElement>("[data-section]");
    expect(wrappers[wrappers.length - 1]!.dataset.section).toBe(
      "closing-square",
    );
    expect(
      screen.queryByText(/Host Your Community|Take a Challenge|Build With AI/),
    ).toBeNull();
    // The only link to /sponsors is "Become a sponsor".
    const sponsorLinks = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("href") === "/sponsors");
    expect(sponsorLinks.map((a) => a.textContent)).toEqual([
      en.homeSponsors.become,
    ]);
  });

  it("never links to a placeholder #", () => {
    renderIn();
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).not.toMatch(/^#?$/);
    }
  });

  it("uses no external-link arrow on internal links", () => {
    const { container } = renderIn();
    for (const link of container.querySelectorAll("a")) {
      if (/^https?:/.test(link.getAttribute("href") ?? "")) continue;
      expect(link.querySelector(".lucide-arrow-up-right")).toBeNull();
    }
  });

  it("uses the shared house kicker for every section label", () => {
    const { container } = renderIn();
    for (const heading of container.querySelectorAll("h2")) {
      if (heading.id === "home-closing-title") continue; // a Sans headline
      expect(heading, heading.textContent ?? "").toHaveAttribute(
        "data-slot",
        "section-label",
      );
    }
  });

  it("speaks Dutch on /nl", () => {
    renderIn({}, "nl");
    expect(
      screen.getByRole("region", { name: nl.homeRecent.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: nl.homeClosing.title }),
    ).toBeInTheDocument();
  });
});

describe("homepage wiring", () => {
  // The page is an async server component that reads Payload and the
  // database, so jsdom cannot render it. It only fetches and hands data to
  // HomeSections (tested above by rendering); this checks that hand-off
  // and the order of the three top-level pieces.
  const page = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../app/[locale]/page.tsx",
    ),
    "utf8",
  );

  it("mounts hero, stats, then the sections", () => {
    const at = ["<HomeHeroPlaza", "<HomeStats", "<HomeSections"].map((tag) =>
      page.indexOf(tag),
    );
    expect(at.every((i) => i > -1)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});

describe("homepage messages", () => {
  const keys = (o: unknown, prefix = ""): string[] =>
    o && typeof o === "object"
      ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
      : [prefix];

  it.each(["homeStats", "homeRecent", "homeSponsors", "homeClosing"] as const)(
    "%s has the same, non-empty keys in EN and NL",
    (ns) => {
      expect(keys(nl[ns]).sort()).toEqual(keys(en[ns]).sort());
      for (const m of [en[ns], nl[ns]]) {
        for (const value of Object.values(m)) {
          expect(String(value).trim()).not.toBe("");
        }
      }
    },
  );

  it("drops the messages of the removed sections", () => {
    for (const m of [en, nl] as Record<string, unknown>[]) {
      expect(m).not.toHaveProperty("aiHumans");
      expect(m).not.toHaveProperty("sponsorPitch");
      expect(m).not.toHaveProperty("join");
    }
  });
});
