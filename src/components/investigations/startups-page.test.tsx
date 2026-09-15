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
import { STARTUPS_INSIGHTS_CAPTION } from "@/lib/investigations/startups-insights";
import { appPathFromGuideHref, JOIN_PATH } from "@/lib/seo-guides";
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
  listedOn: "2026-09-15",
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
    expect(src).toContain("isStartupInsightsTab");
    expect(src).toContain("robots: { index: true, follow: true }");
    const insights = readFileSync(INSIGHTS_FILE, "utf8");
    expect(insights).toContain("buildStartupInsights");
    expect(insights).toContain('tab="insights"');
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

  it("renders listed cards, soft-omits blank logo/stage, and pins verified coords", () => {
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
    expect(container.querySelector("img")).toBeNull();
    expect(hrefsOf(container)).toContain("https://fixture.example");
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
    ).toEqual(["added-over-time", "category-mix", "region-mix"]);
    expect(tiles[0]).toHaveClass("md:col-span-2");
    for (const tile of tiles) {
      expect(
        tile.querySelector("[data-startups-insight-table] table"),
      ).not.toBeNull();
    }
    expect(container.textContent).toContain(STARTUPS_INSIGHTS_CAPTION);
    expect(hrefsOf(container)).toContain(STARTUPS_JOIN_HREF);
  });
});

describe("Startups card soft-omit", () => {
  it("hides logo, stage, and region when they are blank", () => {
    const { container } = render(
      <StartupsCard
        card={{ ...FIXTURE_CARD, region: null, lat: null, lng: null }}
        locale="en"
        isModerator={false}
        copy={{
          openHomepage: "Open homepage",
          sources: "Sources",
          edit: "Edit",
        }}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).not.toContain("Toronto, Canada");
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
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
    expect(readFileSync(SITEMAP_FILE, "utf8")).toContain(STARTUPS_PATH);
    expect(readFileSync(SITEMAP_FILE, "utf8")).toContain(
      STARTUPS_INSIGHTS_PATH,
    );
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

  it("has a schema-only migration and an ops insert path", () => {
    expect(existsSync(MIGRATION_FILE)).toBe(true);
    expect(readFileSync(MIGRATION_FILE, "utf8")).not.toMatch(/INSERT INTO/i);
    expect(existsSync(OPS_DOC)).toBe(true);
    expect(existsSync(FIXTURE)).toBe(true);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(
      /createStartup|createStartups/,
    );
  });

  it("does not bake Pulse company names into UI components", () => {
    for (const file of [
      ...componentSources(),
      PAGE_FILE,
      INSIGHTS_FILE,
      MIGRATION_FILE,
    ]) {
      expect(readFileSync(file, "utf8")).not.toMatch(BAKED_COMPANIES);
    }
  });
});
