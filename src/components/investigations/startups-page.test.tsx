import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/investigations/startups",
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) =>
    (en.investigationsStartups as Record<string, string>)[key] ?? key,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      startups: { listApproved: { invalidate: vi.fn() } },
    }),
    startups: {
      createStartup: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateStartup: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

vi.mock("./startups-insights-charts", () => ({
  StartupCategoryMixChart: () => <div data-testid="chart-category" />,
  StartupRegionMixChart: () => <div data-testid="chart-region" />,
  StartupStageMixChart: () => <div data-testid="chart-stage" />,
  StartupSourcesCoverageChart: () => <div data-testid="chart-sources" />,
  StartupAddedOverTimeChart: () => <div data-testid="chart-added" />,
}));

vi.mock("./startups-map", () => ({
  StartupsMap: ({ pins }: { pins: Array<{ id: string }> }) =>
    pins.length > 0 ? <div data-testid="startups-map" /> : null,
}));

import {
  STARTUPS_H1,
  STARTUPS_INSIGHTS_H1,
  STARTUPS_INSIGHTS_PATH,
  STARTUPS_JOIN_HREF,
  STARTUPS_PATH,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { HUB_OPEN_HREF } from "@/lib/join-path";
import { STARTUPS_INSIGHTS_CAPTION } from "@/lib/investigations/startups-insights";
import { appPathFromGuideHref, JOIN_PATH } from "@/lib/seo-guides";
import { startupsV1PublicCards } from "@/lib/investigations/startups-v1-seeds";
import { StartupsPage } from "./startups-page";
import { StartupsCard } from "./startups-card";

const dir = dirname(fileURLToPath(import.meta.url));
const appLocale = join(dir, "../../app/[locale]");
const PAGE_FILE = join(appLocale, "investigations/startups/page.tsx");
const INSIGHTS_FILE = join(
  appLocale,
  "investigations/startups/insights/page.tsx",
);
const INDEX_FILE = join(appLocale, "investigations/page.tsx");
const SITEMAP_FILE = join(dir, "../../app/sitemap.ts");
const SITEMAP_TEST_FILE = join(dir, "../../app/sitemap.test.ts");
const MIGRATION_FILE = join(dir, "../../migrations/20260915b_startups.ts");
const SEED_MIGRATION_FILE = join(
  dir,
  "../../migrations/20260915c_startups_v1_seeds.ts",
);
const SEED_MODULE = join(dir, "../../lib/investigations/startups-v1-seeds.ts");
const SOFT_OMIT_MIGRATION_FILE = join(
  dir,
  "../../migrations/20260915d_startups_soft_omit_fields.ts",
);
const QUERIES_FILE = join(dir, "../../server/startups/queries.ts");
const PAGINATION_FILE = join(dir, "startups-pagination.tsx");
const SUBMIT_FILE = join(dir, "startups-submit-dialog.tsx");
const OPS_DOC = join(dir, "../../../docs/ops/startups.md");
const FIXTURE = join(
  dir,
  "../../../docs/ops/fixtures/startups-batch1-payload.json",
);

const BANNED =
  /valuation|headcount|attendance|unicorn|employees|\bARR\b|largest|growth rate/i;

const BAKED_COMPANIES =
  /Anthropic|Mistral AI|Hugging Face|Cohere|Perplexity|LangChain|Pinecone|Weaviate|Fireworks AI|Figure AI|Agility Robotics|Apptronik|1X Technologies|Physical Intelligence|Skild AI|Aalo Atomics|Emerald AI/;

const FIXTURE_CARD: StartupPublicCard = {
  id: "fixture-one",
  name: "Fixture Co",
  homepage: "https://fixture.example",
  category: "models",
  sources: ["https://fixture.example/about"],
  region: "Toronto, Canada",
  lat: 43.65,
  lng: -79.38,
  stage: null,
  logoUrl: null,
  founders: [],
  exitStatus: null,
  acquirer: null,
  exitOn: null,
  jobsUrl: null,
  listedOn: "2026-09-15",
};

const CARD_COPY = {
  openHomepage: "Open homepage",
  openJobs: "Open jobs",
  sources: "Sources",
  founders: "Founders",
  edit: "Edit",
};

function tFrom(messages: typeof en.investigationsStartups) {
  return (key: string) => messages[key as keyof typeof messages] ?? "";
}

function hrefsOf(container: HTMLElement) {
  return [...container.querySelectorAll("a")].map((node) =>
    node.getAttribute("href"),
  );
}

function componentSources() {
  return readdirSync(dir)
    .filter((name) => name.startsWith("startups") && name.endsWith(".tsx"))
    .filter((name) => !name.endsWith(".test.tsx"))
    .map((name) => join(dir, name));
}

describe("Startups investigation route", () => {
  it("lives under /investigations/startups with a dedicated insights path", () => {
    expect(STARTUPS_PATH).toBe("/investigations/startups");
    expect(existsSync(PAGE_FILE)).toBe(true);
    expect(existsSync(INSIGHTS_FILE)).toBe(true);
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("STARTUPS_PATH");
    expect(src).toContain("localeAlternates");
    expect(src).toContain("listApprovedPublicStartups");
    expect(src).toContain('dynamic = "force-dynamic"');
    expect(src).toContain("isStartupInsightsTab");
    expect(src).toContain("startupsPublicRobots");
    expect(src).not.toContain("robots: { index: true, follow: true }");
    const layoutFile = join(appLocale, "investigations/startups/layout.tsx");
    expect(existsSync(layoutFile)).toBe(true);
    expect(readFileSync(layoutFile, "utf8")).toContain("index: false");
    const insights = readFileSync(INSIGHTS_FILE, "utf8");
    expect(insights).toContain("buildStartupInsights");
    expect(insights).toContain("listApprovedPublicStartups");
    expect(insights).toContain("startupsPublicRobots");
    expect(insights).toContain('dynamic = "force-dynamic"');
    expect(insights).toContain('tab="insights"');
    expect(insights).not.toContain("robots: { index: true, follow: true }");
    expect(readFileSync(QUERIES_FILE, "utf8")).not.toMatch(BAKED_COMPANIES);
  });
});

describe("StartupsPage", () => {
  it("renders the empty directory without inventing companies", () => {
    const { container } = render(
      <StartupsPage locale="en" t={tFrom(en.investigationsStartups)} />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: STARTUPS_H1 }),
    ).toBeInTheDocument();
    expect(container.textContent).toContain(en.investigationsStartups.empty);
    expect(container.querySelectorAll("[data-startup-card]")).toHaveLength(0);
    expect(screen.queryByTestId("startups-map")).not.toBeInTheDocument();
    expect(hrefsOf(container)).toContain("/investigations");
    expect(hrefsOf(container)).toContain(STARTUPS_INSIGHTS_PATH);
    expect(hrefsOf(container)).toContain(STARTUPS_JOIN_HREF);
    expect(hrefsOf(container).some((href) => href === "/en/join")).toBe(false);
    expect(container.textContent).not.toMatch(BANNED);
    expect(container.textContent).not.toMatch(BAKED_COMPANIES);
    expect(screen.queryByText("Add a company")).not.toBeInTheDocument();
  });

  it("renders listed cards, soft-omits blank logo/stage, and pins sourced places", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[FIXTURE_CARD]}
      />,
    );
    expect(container.querySelector("[data-startup-card]")).not.toBeNull();
    expect(container.textContent).toContain("Fixture Co");
    expect(container.textContent).toContain("Toronto, Canada");
    expect(screen.getByTestId("startups-map")).toBeInTheDocument();
    expect(
      container.querySelector("img:not([data-startup-source-favicon])"),
    ).toBeNull();
    expect(hrefsOf(container)).toContain("https://fixture.example");
    expect(hrefsOf(container)).toContain("https://fixture.example/about");
    expect(screen.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "https://fixture.example/about",
    );
    expect(container.querySelector("[data-startup-exit]")).toBeNull();
    expect(container.querySelector("[data-startup-founders]")).toBeNull();
    expect(container.querySelector("[data-startup-jobs]")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open jobs" }),
    ).not.toBeInTheDocument();
  });

  it("uses Writing Bot chrome: slim deck, search, category, Newest", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[FIXTURE_CARD]}
      />,
    );
    const heading = screen.getByRole("heading", {
      level: 1,
      name: STARTUPS_H1,
    });
    expect(heading.className).toMatch(/text-2xl/);
    expect(heading.className).not.toMatch(/text-5xl/);
    expect(container.textContent).toContain(en.investigationsStartups.lead);
    expect(container.textContent).toContain(en.investigationsStartups.lead2);
    expect(
      screen.getByPlaceholderText("Search companies…"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Filter by category").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Filter by region").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Filter by stage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Filter by exit").length).toBeGreaterThan(0);
    expect(container.querySelector("#startup-status")).not.toBeNull();
    expect(screen.getAllByText("All listings").length).toBeGreaterThan(0);
    expect(screen.getAllByText("All companies").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Newest first").length).toBeGreaterThan(0);
    expect(en.investigationsStartups.sortName).toBe("Name A–Z");
    expect(en.investigationsStartups.sortCategory).toBe("Category");
    expect(screen.getByRole("link", { name: "Directory" })).toHaveAttribute(
      "href",
      STARTUPS_PATH,
    );
    expect(screen.getByRole("link", { name: "Insights" })).toHaveAttribute(
      "href",
      STARTUPS_INSIGHTS_PATH,
    );
    expect(screen.getByRole("link", { name: "Open homepage" })).toHaveAttribute(
      "href",
      "https://fixture.example",
    );
  });

  it("pins a sourced city/region with no stored coords, and skips unknown", () => {
    const { rerender } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          {
            ...FIXTURE_CARD,
            lat: null,
            lng: null,
          },
        ]}
      />,
    );
    expect(screen.getByTestId("startups-map")).toBeInTheDocument();

    rerender(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[{ ...FIXTURE_CARD, region: null, lat: null, lng: null }]}
      />,
    );
    expect(screen.queryByTestId("startups-map")).not.toBeInTheDocument();
  });

  it("renders crawlable ?page= links when the directory is past ~50 rows", () => {
    const companies = Array.from({ length: 51 }, (_, index) => ({
      ...FIXTURE_CARD,
      id: `page-card-${index}`,
      name: `Fixture Co ${index + 1}`,
      homepage: `https://fixture-${index}.example`,
    }));
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={companies}
        query={{ q: "", category: "all", page: 1 }}
      />,
    );
    const hrefs = hrefsOf(container);
    expect(hrefs).toContain("/investigations/startups?page=2");
    expect(hrefs).toContain("/investigations/startups?page=3");
    expect(container.querySelectorAll("[data-startup-card]")).toHaveLength(24);
  });

  it("keeps Dutch copy on the same investigation path", () => {
    const { container } = render(
      <StartupsPage locale="nl" t={tFrom(nl.investigationsStartups)} />,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      nl.investigationsStartups.title,
    );
    expect(hrefsOf(container)).toContain(STARTUPS_JOIN_HREF);
    expect(container.textContent).toContain(nl.investigationsStartups.lead);
    expect(container.textContent).toContain(
      nl.investigationsStartups.howWeList,
    );
  });
});

describe("Startups Insights tab", () => {
  it("soft-fails empty and renders a CSS bento with table fallbacks when listed", () => {
    const empty = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        tab="insights"
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: STARTUPS_INSIGHTS_H1 }),
    ).toBeInTheDocument();
    expect(
      empty.container.querySelector("[data-startups-insights-empty]"),
    ).not.toBeNull();
    expect(
      empty.container.querySelector("[data-startups-insights-bento]"),
    ).toBeNull();
    empty.unmount();

    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        tab="insights"
        companies={[FIXTURE_CARD]}
      />,
    );
    expect(
      container.querySelector("[data-startups-insights-bento]"),
    ).not.toBeNull();
    const tiles = [
      ...container.querySelectorAll("[data-startups-insight-tile]"),
    ];
    expect(
      tiles.map((tile) => tile.getAttribute("data-startups-insight-tile")),
    ).toEqual([
      "added-over-time",
      "category-mix",
      "region-mix",
      "stage-mix",
      "sources-coverage",
    ]);
    // Region stays omitted until ≥5 distinct sourced regions — one seed is not enough.
    expect(tiles[0]).toHaveClass("md:col-span-2");
    expect(
      screen.getByRole("heading", { level: 2, name: "Added over time" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Category" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Region" }),
    ).toBeInTheDocument();
    const regionTile = tiles.find(
      (tile) =>
        tile.getAttribute("data-startups-insight-tile") === "region-mix",
    );
    expect(regionTile?.hasAttribute("data-startups-insight-omitted")).toBe(
      true,
    );
    expect(screen.queryByTestId("chart-region")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Stage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Sources coverage" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Directory" })).toHaveAttribute(
      "href",
      STARTUPS_PATH,
    );
    const chartTiles = tiles.filter(
      (tile) =>
        tile.querySelector("[data-startups-insight-table] table") != null,
    );
    expect(
      chartTiles.map((tile) => tile.getAttribute("data-startups-insight-tile")),
    ).toEqual(["added-over-time", "category-mix", "sources-coverage"]);
    const stageTile = tiles.find(
      (tile) => tile.getAttribute("data-startups-insight-tile") === "stage-mix",
    );
    expect(stageTile?.hasAttribute("data-startups-insight-omitted")).toBe(true);
    expect(
      stageTile?.querySelector("[data-startups-insight-table]"),
    ).toBeNull();
    expect(screen.queryByTestId("chart-stage")).not.toBeInTheDocument();
    expect(screen.getByTestId("chart-sources")).toBeInTheDocument();
    expect(container.textContent).toContain(STARTUPS_INSIGHTS_CAPTION);
    expect(hrefsOf(container)).toContain(STARTUPS_JOIN_HREF);
  });

  it("omits a Region table even if a Toronto/NY stub mix is passed in", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        tab="insights"
        companies={[FIXTURE_CARD]}
        insights={{
          total: 2,
          categoryMix: [{ id: "models", label: "Models", count: 2 }],
          regionMix: [
            { region: "Toronto, Canada", count: 1 },
            { region: "New York, US", count: 1 },
          ],
          stageMix: null,
          sourcesCoverage: [{ sources: 1, label: "1 source", count: 2 }],
          addedOverTime: [{ month: "2026-09", label: "Sep 2026", count: 2 }],
        }}
      />,
    );
    const regionTile = [
      ...container.querySelectorAll("[data-startups-insight-tile]"),
    ].find(
      (tile) =>
        tile.getAttribute("data-startups-insight-tile") === "region-mix",
    );
    expect(regionTile?.hasAttribute("data-startups-insight-omitted")).toBe(
      true,
    );
    expect(
      regionTile?.querySelector("[data-startups-insight-table]"),
    ).toBeNull();
    expect(screen.queryByTestId("chart-region")).not.toBeInTheDocument();
    expect(container.textContent).not.toContain("Toronto, Canada");
    expect(container.textContent).not.toContain("New York, US");
    expect(container.textContent).toContain(
      en.investigationsStartups.regionOmitted,
    );

    const nlView = render(
      <StartupsPage
        locale="nl"
        t={tFrom(nl.investigationsStartups)}
        tab="insights"
        companies={[FIXTURE_CARD]}
        insights={{
          total: 2,
          categoryMix: [{ id: "models", label: "Models", count: 2 }],
          regionMix: [
            { region: "Toronto, Canada", count: 1 },
            { region: "New York, US", count: 1 },
          ],
          stageMix: null,
          sourcesCoverage: [{ sources: 1, label: "1 bron", count: 2 }],
          addedOverTime: [{ month: "2026-09", label: "sep 2026", count: 2 }],
        }}
      />,
    );
    expect(nlView.container.textContent).toContain(
      nl.investigationsStartups.regionOmitted,
    );
    expect(nlView.container.textContent).not.toContain("Toronto, Canada");
    nlView.unmount();
  });

  it("swaps Directory and Insights Join to Open Hub for signed-in Hub members", () => {
    const directory = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[FIXTURE_CARD]}
        promoteJoin={false}
      />,
    );
    expect(hrefsOf(directory.container)).not.toContain(STARTUPS_JOIN_HREF);
    expect(directory.container.textContent).not.toContain(
      en.investigationsStartups.joinCta,
    );
    expect(
      screen.getByRole("link", { name: en.investigationsStartups.hubCta }),
    ).toHaveAttribute("href", HUB_OPEN_HREF);
    directory.unmount();

    const insights = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        tab="insights"
        companies={[FIXTURE_CARD]}
        promoteJoin={false}
      />,
    );
    expect(hrefsOf(insights.container)).not.toContain(STARTUPS_JOIN_HREF);
    expect(insights.container.textContent).not.toContain(
      en.investigationsStartups.joinCta,
    );
    expect(
      screen.getByRole("link", { name: en.investigationsStartups.hubCta }),
    ).toHaveAttribute("href", HUB_OPEN_HREF);
  });
});

describe("Startups card soft-omit", () => {
  it("hides logo, stage, region, founders, exit, and jobs when they are blank", () => {
    const { container } = render(
      <StartupsCard
        card={{ ...FIXTURE_CARD, region: null, lat: null, lng: null }}
        locale="en"
        isModerator={false}
        copy={CARD_COPY}
      />,
    );
    expect(
      container.querySelector("img:not([data-startup-source-favicon])"),
    ).toBeNull();
    expect(container.textContent).not.toContain("Toronto, Canada");
    expect(container.querySelector("[data-startup-exit]")).toBeNull();
    expect(container.querySelector("[data-startup-founders]")).toBeNull();
    expect(container.querySelector("[data-startup-jobs]")).toBeNull();
    expect(screen.queryByText("Founders")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Open jobs" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("shows sourced founders, exit badge, and Open jobs only when present", () => {
    const { container } = render(
      <StartupsCard
        card={{
          ...FIXTURE_CARD,
          founders: [
            {
              name: "Ada Example",
              url: "https://ada.example",
              imageUrl: "https://ada.example/ada.jpg",
            },
            { name: "No Url", url: null, imageUrl: null },
            { name: "   ", url: "https://blank.example", imageUrl: null },
          ],
          exitStatus: "acquired",
          acquirer: "Example Corp",
          exitOn: "2024-06-01",
          jobsUrl: "https://fixture.example/careers",
        }}
        locale="en"
        isModerator={false}
        copy={CARD_COPY}
      />,
    );
    expect(container.querySelector("[data-startup-exit]")?.textContent).toBe(
      "Acquired·Example Corp·2024",
    );
    expect(container.querySelector("[data-startup-founders]")).not.toBeNull();
    expect(
      container.querySelector("[data-slot='avatar-group']"),
    ).not.toBeNull();
    const adaLinks = screen.getAllByRole("link", { name: "Ada Example" });
    expect(adaLinks.length).toBeGreaterThanOrEqual(2);
    expect(
      adaLinks.every(
        (node) => node.getAttribute("href") === "https://ada.example",
      ),
    ).toBe(true);
    expect(
      container.querySelector(
        "[data-startup-founder-hover='https://ada.example']",
      ),
    ).toHaveAttribute("title", "Ada Example");
    expect(
      container.querySelector("[data-startup-founder-ssr]"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-startup-founder-profile='https://ada.example']",
      )?.textContent,
    ).toBe("Ada Example");
    expect(container.textContent).toContain("No Url");
    expect(container.textContent).not.toContain("blank.example");
    expect(
      container.querySelector(
        "[data-startup-founder-photo='https://ada.example/ada.jpg']",
      ),
    ).not.toBeNull();
    expect(screen.getByRole("link", { name: "Open jobs" })).toHaveAttribute(
      "href",
      "https://fixture.example/careers",
    );
  });

  it("shows initials and +N after three founders; never invents a face", () => {
    const { container } = render(
      <StartupsCard
        card={{
          ...FIXTURE_CARD,
          founders: [
            { name: "Ada One", url: null, imageUrl: null },
            { name: "Bea Two", url: null, imageUrl: null },
            { name: "Cara Three", url: null, imageUrl: null },
            { name: "Dee Four", url: null, imageUrl: null },
          ],
        }}
        locale="en"
        isModerator={false}
        copy={CARD_COPY}
      />,
    );
    expect(
      container.querySelector("[data-slot='avatar-group-count']")?.textContent,
    ).toBe("+1");
    expect(container.querySelector("[data-startup-founder-photo]")).toBeNull();
    expect(container.textContent).toContain("AO");
    expect(container.textContent).toContain("Dee Four");
  });

  it("dedupes source chip labels and never shows a digit source", () => {
    const { container } = render(
      <StartupsCard
        card={{
          ...FIXTURE_CARD,
          sources: [
            "https://fixture.example/news/one",
            "https://fixture.example/news/two",
            "https://en.wikipedia.org/wiki/Fixture",
          ],
        }}
        locale="en"
        isModerator={false}
        copy={CARD_COPY}
      />,
    );
    const chips = [...container.querySelectorAll("[data-startup-source-chip]")];
    expect(
      chips.map((node) => node.getAttribute("data-startup-source-chip")),
    ).toEqual(["News", "Wikipedia"]);
    expect(container.textContent).not.toMatch(/\b[123]\b/);
    expect(
      container
        .querySelector("[data-startup-source-favicon]")
        ?.getAttribute("data-startup-source-favicon"),
    ).toBe("https://fixture.example/favicon.ico");

    const tech = render(
      <StartupsCard
        card={{
          ...FIXTURE_CARD,
          sources: [
            "https://techcrunch.com/2024/01/skild-one",
            "https://techcrunch.com/2024/06/skild-two",
            "https://techcrunch.com/2025/01/skild-three",
          ],
        }}
        locale="en"
        isModerator={false}
        copy={CARD_COPY}
      />,
    );
    expect(
      [...tech.container.querySelectorAll("[data-startup-source-chip]")].map(
        (node) => node.getAttribute("data-startup-source-chip"),
      ),
    ).toEqual(["TechCrunch"]);
    expect(
      tech.container
        .querySelector("[data-startup-source-favicon]")
        ?.getAttribute("data-startup-source-favicon"),
    ).toBe("https://techcrunch.com/favicon.ico");
    tech.unmount();
  });

  it("renders the Cursor joining-spacex chip and Acquired·SpaceX·2026 badge from fixture data", () => {
    const cursor = startupsV1PublicCards().find(
      (card) => card.name === "Cursor (Anysphere)",
    );
    expect(cursor).toBeDefined();
    const { container } = render(
      <StartupsCard
        card={cursor!}
        locale="en"
        isModerator={false}
        copy={CARD_COPY}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Cursor: Joining SpaceX" }),
    ).toHaveAttribute("href", "https://cursor.com/blog/joining-spacex");
    expect(container.querySelector("[data-startup-exit]")?.textContent).toBe(
      "Acquired·SpaceX·2026",
    );
    expect(
      container.querySelector("[data-slot='avatar-group-count']")?.textContent,
    ).toBe("+1");
    expect(container.querySelector("[data-startup-founder-photo]")).toBeNull();
    const labels = [
      ...container.querySelectorAll("[data-startup-source-chip]"),
    ].map((node) => node.getAttribute("data-startup-source-chip"));
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Startups i18n", () => {
  it("has matching EN and NL keys and no banned metrics", () => {
    expect(Object.keys(nl.investigationsStartups).sort()).toEqual(
      Object.keys(en.investigationsStartups).sort(),
    );
    expect(en.investigationsStartups.title).toBe(STARTUPS_H1);
    expect(en.investigationsStartups.chartCaption).toBe(
      STARTUPS_INSIGHTS_CAPTION,
    );
    expect(Object.values(en.investigationsStartups).join("\n")).not.toMatch(
      BANNED,
    );
    expect(Object.values(nl.investigationsStartups).join("\n")).not.toMatch(
      BANNED,
    );
  });
});

describe("Startups site integration", () => {
  it("is in the sitemap and investigations index", () => {
    const sitemap = readFileSync(SITEMAP_FILE, "utf8");
    expect(sitemap).toContain("startupInvestigationSitemapPaths");
    expect(sitemap).toContain("listApprovedPublicStartups");
    expect(readFileSync(SITEMAP_TEST_FILE, "utf8")).toContain(STARTUPS_PATH);
    expect(readFileSync(INDEX_FILE, "utf8")).toContain(STARTUPS_PATH);
  });

  it("maps www cite URLs onto the investigation path", () => {
    expect(
      appPathFromGuideHref(
        "https://www.aitcommunity.org/en/investigations/startups",
      ),
    ).toBe(STARTUPS_PATH);
    expect(
      appPathFromGuideHref(
        "https://www.aitcommunity.org/en/investigations/startups/insights",
      ),
    ).toBe(STARTUPS_INSIGHTS_PATH);
    expect(
      appPathFromGuideHref("/en/investigations/startups?tab=insights"),
    ).toBe(STARTUPS_INSIGHTS_PATH);
  });

  it("keeps Join as a Hub door with UTMs", () => {
    expect(STARTUPS_JOIN_HREF).toContain(`www.aitcommunity.org/en${JOIN_PATH}`);
    expect(STARTUPS_JOIN_HREF).toContain("utm_campaign=startups");
  });

  it("has a schema migration plus a v1 seed INSERT, and keeps the staff insert API", () => {
    expect(existsSync(MIGRATION_FILE)).toBe(true);
    expect(readFileSync(MIGRATION_FILE, "utf8")).not.toMatch(/INSERT INTO/i);
    expect(existsSync(SEED_MIGRATION_FILE)).toBe(true);
    expect(existsSync(SOFT_OMIT_MIGRATION_FILE)).toBe(true);
    expect(existsSync(SEED_MODULE)).toBe(true);
    expect(readFileSync(SEED_MIGRATION_FILE, "utf8")).toMatch(/INSERT INTO/i);
    expect(existsSync(OPS_DOC)).toBe(true);
    expect(existsSync(FIXTURE)).toBe(true);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(
      /createStartup|createStartups/,
    );
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/v1 seed/i);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/people graph/i);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/enriched/i);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/3000/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/Writing Bot/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/noindex/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/3000/);
    expect(readFileSync(FIXTURE, "utf8")).toContain("jobs_url");
    expect(readFileSync(FIXTURE, "utf8")).toContain('"status": "ipo"');
    expect(readFileSync(SOFT_OMIT_MIGRATION_FILE, "utf8")).toContain(
      "jobs_url",
    );
  });

  it("SSR-reads Neon, paginates with crawlable ?page= links, and sitemaps from the live count", () => {
    const page = readFileSync(PAGE_FILE, "utf8");
    const insights = readFileSync(INSIGHTS_FILE, "utf8");
    const queries = readFileSync(QUERIES_FILE, "utf8");
    const sitemap = readFileSync(SITEMAP_FILE, "utf8");
    const pagination = readFileSync(PAGINATION_FILE, "utf8");
    const submit = readFileSync(SUBMIT_FILE, "utf8");

    expect(page).toContain("listApprovedPublicStartups");
    expect(page).toContain('dynamic = "force-dynamic"');
    expect(page).toContain("shouldPromoteJoin");
    expect(page).toContain("promoteJoin");
    expect(page).toContain("startupsPublicRobots");
    expect(page).toContain("status?:");
    expect(page).toContain("region");
    expect(page).toContain("hiring");
    expect(insights).toContain("listApprovedPublicStartups");
    expect(insights).toContain("shouldPromoteJoin");
    expect(insights).toContain("promoteJoin");
    expect(insights).toContain('dynamic = "force-dynamic"');
    expect(queries).not.toMatch(/unstable_cache|revalidateTag/);
    expect(submit).toContain("router.refresh()");

    expect(pagination).toContain("buildStartupDirectoryPath");
    expect(pagination).toContain("<Link");
    expect(pagination).not.toMatch(/onClick=\{[^}]*page/);

    expect(sitemap).toContain("listApprovedPublicStartups");
    expect(sitemap).toContain("startupInvestigationSitemapPaths(cards.length)");
    expect(sitemap).toContain("filterUnlistedStartupSitemapEntries");
    expect(sitemap).not.toContain('"/investigations/startups",');
  });

  it("does not bake Pulse company names into UI components or queries", () => {
    for (const file of [
      ...componentSources(),
      PAGE_FILE,
      INSIGHTS_FILE,
      MIGRATION_FILE,
      QUERIES_FILE,
    ]) {
      expect(readFileSync(file, "utf8")).not.toMatch(BAKED_COMPANIES);
    }
  });
});
