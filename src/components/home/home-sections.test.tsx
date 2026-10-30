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
import type { EventRowInput } from "@/components/events/rows/event-rows";

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
  magazines: [
    {
      id: 1,
      name: "Builders Journal",
      slug: "builders",
      logoUrl: null,
      description: null,
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
    },
  ],
  upcomingEvents: [UPCOMING],
  latestNews: [
    {
      id: "daily",
      kind: "news",
      title: "Daily news",
      summary: "The latest.",
      href: "https://example.com/news",
      source: "Example",
      date: "2026-09-27T09:00:00Z",
      englishFallback: false,
    },
  ],
  recentEvents: [PAST],
  sponsors: [
    { id: 1, name: "Acme", href: "https://acme.ai/", logoUrl: null },
    { id: 2, name: "Beta", href: null, logoUrl: null },
  ],
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
      timeZone="Europe/Amsterdam"
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
  it("keeps the mobile reading order: communities, events, news, magazines, proof, sponsors, organizers", () => {
    const { container } = renderIn();
    expect(renderedOrder(container)).toEqual(HOME_SECTION_ORDER);
    expect(
      screen.queryByRole("region", { name: en.whatWeDo.kicker }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: en.homeDiscovery.organizers }),
    ).toBeInTheDocument();
  });

  it("pairs communities with news on desktop and leaves events full-width", () => {
    const { container } = renderIn();
    expect(
      container.querySelector('[data-section="featured-communities"]'),
    ).toHaveClass("lg:col-span-8", "lg:row-start-1");
    expect(container.querySelector('[data-section="latest-news"]')).toHaveClass(
      "lg:col-span-4",
      "lg:row-start-1",
    );
    expect(
      container.querySelector('[data-section="upcoming-events"]'),
    ).toHaveClass("lg:col-span-12", "lg:row-start-2");
  });

  it("removes absent sections and expands the remaining discovery column", () => {
    const { container } = renderIn({
      featuredCommunities: [],
      magazines: [],
      recentEvents: [],
    });
    expect(renderedOrder(container)).toEqual([
      "upcoming-events",
      "latest-news",
      "sponsors",
      "organizers",
    ]);
    expect(container.querySelector('[data-section="latest-news"]')).toHaveClass(
      "lg:col-span-12",
    );
  });

  it("does not leave empty columns when news is missing", () => {
    const { container } = renderIn({ latestNews: [] });
    expect(container.querySelector('[data-section="latest-news"]')).toBeNull();
    expect(
      container.querySelector('[data-section="featured-communities"]'),
    ).toHaveClass("lg:col-span-12");
  });

  it("limits the news rail to four headlines", () => {
    const { container } = renderIn({
      latestNews: Array.from({ length: 6 }, (_, i) => ({
        ...FULL.latestNews![0]!,
        id: String(i),
        title: `News ${i}`,
      })),
    });
    expect(
      container.querySelectorAll('[data-section="latest-news"] li'),
    ).toHaveLength(4);
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
      if (heading.id === "home-organizers-title") continue; // a Sans headline
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
      screen.getByRole("heading", { name: nl.homeDiscovery.organizers }),
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

  it.each([
    "homeDiscovery",
    "homeStats",
    "homeNews",
    "homeRecent",
    "homeSponsors",
    "homeClosing",
  ] as const)("%s has the same, non-empty keys in EN and NL", (ns) => {
    expect(keys(nl[ns]).sort()).toEqual(keys(en[ns]).sort());
    for (const m of [en[ns], nl[ns]]) {
      for (const value of Object.values(m)) {
        expect(String(value).trim()).not.toBe("");
      }
    }
  });

  it("drops the messages of the removed sections", () => {
    for (const m of [en, nl] as Record<string, unknown>[]) {
      expect(m).not.toHaveProperty("aiHumans");
      expect(m).not.toHaveProperty("sponsorPitch");
      expect(m).not.toHaveProperty("join");
    }
  });
});
