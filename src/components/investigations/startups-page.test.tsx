import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type * as NextIntl from "next-intl";
import type { StartupsClusterMapProps } from "./startups-cluster-map-view";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/startups",
  useRouter: () => ({ replace: vi.fn() }),
}));

// Client components get the real English translator, so ICU plurals,
// placeholders, and `t.raw` behave exactly as in production.
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof NextIntl>();
  const t = actual.createTranslator({
    locale: "en",
    messages: en,
    namespace: "investigationsStartups",
  });
  return { ...actual, useTranslations: () => t };
});

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      startups: {
        listApproved: { invalidate: vi.fn() },
        getMyCv: { invalidate: vi.fn() },
        getMyRoleApplication: { invalidate: vi.fn() },
      },
    }),
    startups: {
      createStartup: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      updateStartup: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getMyCv: {
        useQuery: () => ({ data: null, isPending: false }),
      },
      upsertMyCv: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      deleteMyCv: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      setMyJobsFollow: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      getMyRoleApplication: {
        useQuery: () => ({ data: { applying: false }, isPending: false }),
      },
      setMyRoleApplication: {
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
  usePathname: () => "/jobs",
  useRouter: () => ({ replace: vi.fn() }),
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

// Stand-in for the Leaflet map: exposes the props contract so tests can
// drive viewport changes and pin picks the way a viewer would.
vi.mock("./startups-cluster-map", () => ({
  StartupsClusterMap: (props: StartupsClusterMapProps) => (
    <div
      data-testid="startups-map"
      data-pins={props.pins.map((pin) => pin.id).join(",")}
      data-active={props.activeId ?? ""}
    >
      <span data-testid="cluster-title">{props.clusterTitle(3)}</span>
      <button
        type="button"
        onClick={() =>
          props.onViewChange({ west: 0, south: 40, east: 10, north: 60 }, 6)
        }
      >
        Pan to Europe
      </button>
      <button
        type="button"
        onClick={() =>
          props.onViewChange({ west: -130, south: 20, east: -60, north: 50 }, 4)
        }
      >
        Pan to North America
      </button>
      <button
        type="button"
        onClick={() => props.onSelect(props.pins.slice(0, 1))}
      >
        Pick first pin
      </button>
    </div>
  ),
}));

import {
  STARTUPS_H1,
  STARTUPS_INSIGHTS_H1,
  STARTUPS_INSIGHTS_PATH,
  STARTUPS_JOBS_PATH,
  JOBS_ROLE_JOIN_HREF,
  STARTUPS_JOIN_HREF,
  STARTUPS_PATH,
  buildStartupProfilePath,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { StartupsProfilePage } from "./startups-profile";
import { HUB_OPEN_HREF } from "@/lib/join-path";
import { STARTUPS_INSIGHTS_CAPTION } from "@/lib/investigations/startups-insights";
import { appPathFromGuideHref, JOIN_PATH } from "@/lib/seo-guides";
import { startupsV1PublicCards } from "@/lib/investigations/startups-v1-seeds";
import { StartupsPage } from "./startups-page";
import { StartupsJobsPage } from "./startups-jobs-page";
import { StartupsRolePage } from "./startups-role-page";
import { StartupsCard } from "./startups-card";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

const dir = dirname(fileURLToPath(import.meta.url));
const appLocale = join(dir, "../../app/[locale]");
const PAGE_FILE = join(appLocale, "startups/page.tsx");
const PROFILE_FILE = join(appLocale, "startups/[slug]/page.tsx");
const INSIGHTS_FILE = join(appLocale, "startups/insights/page.tsx");
const JOBS_FILE = join(appLocale, "jobs/page.tsx");
const ROLE_FILE = join(appLocale, "jobs/[roleSlug]/page.tsx");
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
const NAV_FILE = join(dir, "../navbar.tsx");
const FOOTER_FILE = join(dir, "../footer.tsx");
const CV_MIGRATION_FILE = join(
  dir,
  "../../migrations/20260921a_startup_member_cv.ts",
);
const OPEN_ROLE_COUNT_MIGRATION_FILE = join(
  dir,
  "../../migrations/20260921b_startup_open_role_count.ts",
);
const ROUTER_FILE = join(dir, "../../server/api/routers/startups.ts");
const MEMBER_DESK_FILE = join(dir, "startups-role-member-desk.tsx");
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
  description: null,
  founders: [],
  exitStatus: null,
  acquirer: null,
  exitOn: null,
  jobsUrl: null,
  listedOn: "2026-09-15",
  slug: "fixture-co",
  openRoleCount: 0,
};

const FIXTURE_ROLE: StartupRolePublic = {
  id: "role-1",
  startupId: "fixture-one",
  startupSlug: "fixture-co",
  startupName: "Fixture Co",
  startupLogoUrl: null,
  slug: "fixture-co-staff-engineer",
  title: "Staff Engineer",
  location: "Toronto, Canada",
  workType: null,
  sourceUrl: "https://fixture.example/careers/staff",
  applyUrl: "https://fixture.example/careers/staff",
  descriptionText: "Build the product.",
  fetchedAt: "2026-09-20T00:00:00.000Z",
  board: "html",
  status: "open",
};

const CARD_COPY = {
  openHomepage: "Open homepage",
  openJobs: "Open jobs",
  openRoles: "{count} open",
  sources: "Sources",
  founders: "Founders",
  edit: "Edit",
};

function tFrom(messages: typeof en.investigationsStartups) {
  return (key: string) => messages[key as keyof typeof messages] ?? "";
}

// The real next-intl formatter (the module is mocked above), so profile tests
// assert ICU plurals and placeholders exactly as production renders them.
const { createTranslator } =
  await vi.importActual<typeof NextIntl>("next-intl");

function profileT(locale: "en" | "nl") {
  const translator = createTranslator({
    locale,
    messages: {
      investigationsStartups: (locale === "nl" ? nl : en)
        .investigationsStartups,
    },
    namespace: "investigationsStartups",
  });
  return (key: string, values?: { count: number }) =>
    translator(key as Parameters<typeof translator>[0], values);
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
  it("lives under /startups with a dedicated insights path", () => {
    expect(STARTUPS_PATH).toBe("/startups");
    expect(existsSync(PAGE_FILE)).toBe(true);
    expect(existsSync(PROFILE_FILE)).toBe(true);
    expect(existsSync(INSIGHTS_FILE)).toBe(true);
    expect(existsSync(JOBS_FILE)).toBe(true);
    expect(existsSync(ROLE_FILE)).toBe(true);
    expect(existsSync(join(appLocale, "startups/jobs/page.tsx"))).toBe(false);
    expect(
      existsSync(join(appLocale, "startups/jobs/[roleSlug]/page.tsx")),
    ).toBe(false);
    const src = readFileSync(PAGE_FILE, "utf8");
    expect(src).toContain("STARTUPS_PATH");
    expect(src).toContain("localeAlternates");
    expect(src).toContain("listApprovedPublicStartups");
    expect(src).toContain('dynamic = "force-dynamic"');
    expect(src).toContain("isStartupInsightsTab");
    expect(src).toContain("startupsPublicRobots");
    expect(src).not.toContain("robots: { index: false");
    expect(existsSync(join(appLocale, "startups/layout.tsx"))).toBe(false);
    const insights = readFileSync(INSIGHTS_FILE, "utf8");
    expect(insights).toContain("buildStartupInsights");
    expect(insights).toContain("listApprovedPublicStartups");
    expect(insights).toContain("startupsPublicRobots");
    expect(insights).toContain('dynamic = "force-dynamic"');
    expect(insights).toContain('tab="insights"');
    expect(insights).not.toContain("robots: { index: false");
    expect(readFileSync(QUERIES_FILE, "utf8")).not.toMatch(BAKED_COMPANIES);
    const profile = readFileSync(PROFILE_FILE, "utf8");
    expect(profile).toContain("findApprovedPublicStartupBySlug");
    expect(profile).toContain("localeAlternates");
    expect(profile).toContain('dynamic = "force-dynamic"');
    expect(profile).toContain("shouldPromoteJoin");
    expect(profile).toContain("StartupsProfilePage");
    expect(readFileSync(JOBS_FILE, "utf8")).toContain("listPublicStartupRoles");
    expect(readFileSync(ROLE_FILE, "utf8")).toContain(
      "findPublicStartupRoleBySlug",
    );
    expect(profile).toContain("listOpenStartupRolesForCompany");
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
    expect(container.querySelector("table")).toBeNull();
    expect(screen.queryByTestId("startups-map")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Map" })).toBeInTheDocument();
    expect(hrefsOf(container)).toContain(STARTUPS_INSIGHTS_PATH);
    expect(hrefsOf(container)).toContain(STARTUPS_JOBS_PATH);
    expect(hrefsOf(container)).toContain(STARTUPS_JOIN_HREF);
    expect(hrefsOf(container).some((href) => href === "/en/join")).toBe(false);
    expect(container.textContent).not.toMatch(BANNED);
    expect(container.textContent).not.toMatch(BAKED_COMPANIES);
    expect(screen.queryByText("Add a company")).not.toBeInTheDocument();
  });

  it("renders an SSR table with homepage and source links, and keeps the map behind the Map view", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[FIXTURE_CARD]}
      />,
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(container.querySelector("[data-startup-card]")).not.toBeNull();
    expect(
      container.querySelector("[data-startup-card]")?.closest("tr"),
    ).not.toBeNull();
    expect(container.textContent).toContain("Fixture Co");
    expect(container.textContent).toContain("Toronto, Canada");
    expect(screen.queryByTestId("startups-map")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Map" })).toBeInTheDocument();
    expect(
      container.querySelector("img:not([data-startup-source-favicon])"),
    ).toBeNull();
    expect(hrefsOf(table as HTMLElement)).toContain("https://fixture.example");
    expect(hrefsOf(table as HTMLElement)).toContain(
      "https://fixture.example/about",
    );
    expect(screen.getByRole("link", { name: "Fixture Co" })).toHaveAttribute(
      "href",
      buildStartupProfilePath("fixture-co"),
    );
    expect(screen.getByRole("link", { name: "Open homepage" })).toHaveAttribute(
      "href",
      "https://fixture.example",
    );
    expect(table?.querySelector("[data-startup-profile]")).toHaveAttribute(
      "href",
      buildStartupProfilePath("fixture-co"),
    );
    expect(table?.querySelector("[data-startup-homepage]")).toHaveAttribute(
      "href",
      "https://fixture.example",
    );
    expect(table?.querySelector("[data-startup-homepage]")?.textContent).toBe(
      "Open homepage",
    );
    const nameHead = screen.getByRole("columnheader", { name: "Company" });
    expect(nameHead.className).toMatch(/sticky/);
    expect(nameHead.className).toMatch(/left-0/);
    const nameCell = screen
      .getByRole("link", { name: "Fixture Co" })
      .closest("td");
    expect(nameCell?.className).toMatch(/sticky/);
    expect(nameCell?.className).toMatch(/left-0/);
    expect(table?.className).toMatch(/border-separate/);
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
    expect(table?.textContent).not.toContain("—");
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
    expect(
      screen.getByRole("link", { name: "Open positions" }),
    ).toHaveAttribute("href", STARTUPS_JOBS_PATH);
    expect(screen.getByRole("link", { name: "Fixture Co" })).toHaveAttribute(
      "href",
      buildStartupProfilePath("fixture-co"),
    );
    expect(
      [...container.querySelectorAll("thead [scope='col']")].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Company", "Category", "Region", "Status", "Sources", "Links"]);
    expect(
      container.querySelector("[data-startup-results]")?.textContent,
    ).toContain("1 company");
    expect(
      screen.queryByRole("columnheader", { name: "Homepage" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Map" })).toBeInTheDocument();
  });

  it("switches to the Map view and lists exactly what the map shows", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          FIXTURE_CARD,
          {
            ...FIXTURE_CARD,
            id: "ams-co",
            name: "Amsterdam Co",
            slug: "amsterdam-co",
            region: "Amsterdam, Netherlands",
            lat: 52.37,
            lng: 4.9,
          },
          {
            ...FIXTURE_CARD,
            id: "nowhere-co",
            name: "Nowhere Co",
            slug: "nowhere-co",
            region: null,
            lat: null,
            lng: null,
          },
        ]}
      />,
    );
    expect(screen.queryByTestId("startups-map")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Table" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Map" }));
    const map = screen.getByTestId("startups-map");
    expect(container.querySelector("table")).toBeNull();
    expect(map.getAttribute("data-pins")?.split(",").sort()).toEqual([
      "ams-co",
      "fixture-one",
    ]);
    expect(screen.getByTestId("cluster-title").textContent).toBe("3 companies");
    const count = () =>
      container.querySelector("[data-startups-map-count]")?.textContent;
    const rows = () =>
      [...container.querySelectorAll("[data-startups-map-row]")].map((row) =>
        row.getAttribute("data-startups-map-row"),
      );
    expect(count()).toBe("2 in view");
    // The list keeps the directory's sort (newest, then name), not map order.
    expect(rows()).toEqual(["ams-co", "fixture-one"]);
    expect(container.textContent).toContain(
      "1 company has no location and is not on the map.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Pan to Europe" }));
    expect(count()).toBe("1 in view");
    expect(rows()).toEqual(["ams-co"]);
    expect(screen.getByRole("link", { name: "Amsterdam Co" })).toHaveAttribute(
      "href",
      buildStartupProfilePath("amsterdam-co"),
    );

    fireEvent.mouseEnter(
      container.querySelector("[data-startups-map-row='ams-co']")!,
    );
    expect(map).toHaveAttribute("data-active", "ams-co");

    fireEvent.click(screen.getByRole("button", { name: "Pick first pin" }));
    expect(count()).toBe("1 company in Amsterdam, Netherlands");
    expect(rows()).toEqual(["ams-co"]);
    fireEvent.click(screen.getByRole("button", { name: "Show all in view" }));
    expect(count()).toBe("1 in view");

    fireEvent.click(screen.getByRole("button", { name: "Pick first pin" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Pan to North America" }),
    );
    // Moving the map ends a pick and hands the list back to the viewport.
    expect(count()).toBe("1 in view");
    expect(rows()).toEqual(["fixture-one"]);
  });

  it("tells the viewer when the visible part of the map is empty", () => {
    render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[FIXTURE_CARD]}
        query={{
          q: "",
          category: "all",
          sort: "newest",
          page: 1,
          view: "map",
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pan to Europe" }));
    expect(
      screen.getByText(en.investigationsStartups.mapEmptyView),
    ).toBeInTheDocument();
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
    expect(hrefs).toContain("/startups?page=2");
    expect(hrefs).toContain("/startups?page=3");
    expect(container.querySelectorAll("[data-startup-card]")).toHaveLength(24);
    const page1Ld = JSON.parse(
      container.querySelector("script[type='application/ld+json']")
        ?.textContent ?? "null",
    ) as { itemListElement?: unknown[] };
    expect(page1Ld.itemListElement).toHaveLength(24);
  });

  it("page-scopes Directory JSON-LD to the current ?page= slice", () => {
    const companies = Array.from({ length: 80 }, (_, index) => ({
      ...FIXTURE_CARD,
      id: `ld-card-${index}`,
      name: `Listed Co ${index + 1}`,
      homepage: `https://listed-${index}.example`,
      // Distinct listedOn so default Newest keeps insertion order (page 3 = 49–72).
      listedOn: new Date(Date.UTC(2026, 8, 15) - index * 86_400_000)
        .toISOString()
        .slice(0, 10),
    }));
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={companies}
        query={{ q: "", category: "all", page: 3 }}
      />,
    );
    expect(container.querySelectorAll("[data-startup-card]")).toHaveLength(24);
    expect(container.textContent).toContain("Listed Co 49");
    expect(container.textContent).not.toContain("Listed Co 1");
    const data = JSON.parse(
      container.querySelector("script[type='application/ld+json']")
        ?.textContent ?? "null",
    ) as { itemListElement?: Array<{ item?: { name?: string } }> };
    expect(data.itemListElement).toHaveLength(24);
    expect(data.itemListElement?.[0]?.item?.name).toBe("Listed Co 49");
    expect(
      data.itemListElement?.some((row) => row.item?.name === "Listed Co 1"),
    ).toBe(false);
    expect(JSON.stringify(data)).not.toContain('"description"');
  });

  it("keeps name→profile and homepage as a secondary control in the table HTML", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          {
            ...FIXTURE_CARD,
            jobsUrl: "https://fixture.example/careers",
          },
        ]}
      />,
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    const nameLink = table?.querySelector("[data-startup-profile]");
    expect(nameLink?.textContent).toBe("Fixture Co");
    expect(nameLink?.getAttribute("href")).toBe(
      buildStartupProfilePath("fixture-co"),
    );
    expect(table?.querySelector("[data-startup-homepage]")).toHaveAttribute(
      "href",
      "https://fixture.example",
    );
    expect(
      table?.querySelectorAll('a[href="https://fixture.example"]'),
    ).toHaveLength(1);
    const sourceLink = table?.querySelector(
      'a[href="https://fixture.example/about"]',
    );
    expect(sourceLink).not.toBeNull();
    expect(sourceLink?.getAttribute("data-startup-source-chip")).toBe("Docs");
    expect(
      table?.querySelector('a[href="https://fixture.example/careers"]'),
    ).toBeNull();
    expect(table?.querySelector("[data-startup-jobs]")).toBeNull();
    expect(container.innerHTML).toContain("<table");
    expect(container.innerHTML).toContain('href="https://fixture.example"');
    expect(container.innerHTML).toContain(
      'href="https://fixture.example/about"',
    );
  });

  it("soft-omits blank logo and short description without inventing marks or copy", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[FIXTURE_CARD]}
      />,
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.querySelector("[data-startup-logo]")).toBeNull();
    expect(table?.querySelector("[data-startup-description]")).toBeNull();
    expect(
      table?.querySelector("img:not([data-startup-source-favicon])"),
    ).toBeNull();
    expect(table?.textContent).not.toContain("—");
    expect(
      table
        ?.querySelector("[data-startup-logo]")
        ?.getAttribute("src")
        ?.includes("favicon.ico"),
    ).not.toBe(true);

    const sourced = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          {
            ...FIXTURE_CARD,
            logoUrl: "https://fixture.example/logo.png",
            description: "Sourced short blurb.",
          },
        ]}
      />,
    );
    const sourcedTable = sourced.container.querySelector("table");
    expect(
      sourcedTable?.querySelector("[data-startup-logo]")?.getAttribute("src"),
    ).toBe("https://fixture.example/logo.png");
    expect(
      sourcedTable?.querySelector("[data-startup-description]")?.textContent,
    ).toBe("Sourced short blurb.");
    sourced.unmount();
  });

  it("soft-omits blank region, stage, exit, and jobs cells without placeholders", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          {
            ...FIXTURE_CARD,
            region: null,
            lat: null,
            lng: null,
            stage: null,
            exitStatus: null,
            jobsUrl: null,
          },
        ]}
      />,
    );
    expect(container.querySelector("table")).not.toBeNull();
    const row = container.querySelector("[data-startup-card]");
    expect(row).not.toBeNull();
    expect(row?.closest("tr")).not.toBeNull();
    expect(row?.textContent).not.toContain("—");
    expect(row?.textContent).not.toContain("N/A");
    expect(row?.textContent).not.toContain("Toronto, Canada");
    expect(container.querySelector("[data-startup-exit]")).toBeNull();
    expect(container.querySelector("[data-startup-jobs]")).toBeNull();
    expect(container.querySelector("[data-startup-region]")).toBeNull();
    expect(container.querySelector("[data-startup-stage]")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Open jobs" }),
    ).not.toBeInTheDocument();
  });

  it("shows a sourced open-role count that links to the jobs table", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[{ ...FIXTURE_CARD, openRoleCount: 3 }]}
      />,
    );
    const jobs = screen.getByRole("link", { name: "3 open" });
    expect(jobs).toHaveAttribute("href", "/jobs?company=fixture-co");
    expect(container.querySelector("[data-startup-jobs]")).toBe(jobs);
  });

  it("renders sourced founders and keeps Name as the profile <a>", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          {
            ...FIXTURE_CARD,
            founders: [
              {
                name: "Ada Example",
                url: "https://ada.example",
                imageUrl: null,
              },
              { name: "No Url", url: null, imageUrl: null },
            ],
          },
        ]}
      />,
    );
    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.querySelector("[data-startup-founders]")).not.toBeNull();
    expect(table?.querySelector("[data-startup-founder-ssr]")).not.toBeNull();
    expect(
      table?.querySelector("[data-startup-founder-name='Ada Example']")
        ?.textContent,
    ).toBe("Ada Example");
    expect(
      table?.querySelector(
        "[data-startup-founder-profile='https://ada.example']",
      ),
    ).toHaveAttribute("href", "https://ada.example");
    expect(table?.textContent).toContain("No Url");
    expect(screen.getByRole("link", { name: "Fixture Co" })).toHaveAttribute(
      "href",
      buildStartupProfilePath("fixture-co"),
    );
    expect(screen.getByRole("link", { name: "Open homepage" })).toHaveAttribute(
      "href",
      "https://fixture.example",
    );
    expect(table?.textContent).not.toContain("—");
  });

  it("pins live sourced regions on the map and keeps ?view=map without pages", () => {
    render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          {
            ...FIXTURE_CARD,
            id: "sf-co",
            name: "SF Co",
            region: "San Francisco, CA, USA",
            lat: null,
            lng: null,
          },
        ]}
        query={{
          q: "",
          category: "all",
          sort: "newest",
          page: 3,
          view: "map",
        }}
      />,
    );
    expect(screen.getByRole("radio", { name: "Map" })).toBeChecked();
    expect(screen.getByTestId("startups-map")).toHaveAttribute(
      "data-pins",
      "sf-co",
    );
    expect(
      screen.queryByRole("navigation", { name: "Pagination" }),
    ).not.toBeInTheDocument();
  });

  it("shows the map empty state when no sourced places are listed", () => {
    render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[{ ...FIXTURE_CARD, region: null, lat: null, lng: null }]}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Map" }));
    expect(screen.getByText("No locations listed yet")).toBeInTheDocument();
    expect(screen.queryByTestId("startups-map")).not.toBeInTheDocument();
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

  it("counts matches and clears every filter at once", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[
          FIXTURE_CARD,
          { ...FIXTURE_CARD, id: "two", name: "Second Co", slug: "second-co" },
        ]}
        query={{ q: "second", category: "all", sort: "newest", page: 1 }}
      />,
    );
    const results = container.querySelector("[data-startup-results]");
    expect(results?.textContent).toContain("1 company");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(results?.textContent).toContain("2 companies");
    expect(
      screen.queryByRole("button", { name: "Clear filters" }),
    ).not.toBeInTheDocument();
  });

  it("folds filters behind a toggle on small screens and shows a monogram for logo-less rows", () => {
    const { container } = render(
      <StartupsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        companies={[FIXTURE_CARD]}
      />,
    );
    const toggle = screen.getByRole("button", { name: "Filters" });
    const filters = container.querySelector("#startup-filters");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(filters?.className).toMatch(/max-md:hidden/);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(filters?.className).not.toMatch(/max-md:hidden/);
    expect(
      container.querySelector("[data-startup-card] [data-startup-monogram]")
        ?.textContent,
    ).toBe("FC");
  });

  it("keeps Dutch Founders and Short description chrome on the directory table", () => {
    const { container } = render(
      <StartupsPage
        locale="nl"
        t={tFrom(nl.investigationsStartups)}
        companies={[FIXTURE_CARD]}
      />,
    );
    expect(nl.investigationsStartups.foundersColumn).toBe("Oprichters");
    expect(nl.investigationsStartups.companyColumn).toBe("Bedrijf");
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.querySelector("[data-startup-profile]")).toHaveAttribute(
      "href",
      buildStartupProfilePath("fixture-co"),
    );
    expect(container.querySelector("[data-startup-homepage]")).toHaveAttribute(
      "href",
      "https://fixture.example",
    );
    expect(container.querySelector("[data-startup-profile]")?.textContent).toBe(
      "Fixture Co",
    );
    expect(
      screen.getByRole("columnheader", { name: "Company" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: "Homepage" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Map" })).toBeInTheDocument();
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
          openRoleCount: 2,
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
    expect(screen.getByRole("link", { name: "2 open" })).toHaveAttribute(
      "href",
      "/jobs?company=fixture-co",
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
    expect(en.investigationsStartups.viewMap).toBe("Map");
    expect(en.investigationsStartups.viewTable).toBe("Table");
    expect(en.investigationsStartups.mapEmpty).toBe("No locations listed yet");
    expect(en.investigationsStartups.companyColumn).toBe("Company");
    expect(en.investigationsStartups.statusColumn).toBe("Status");
    expect(en.investigationsStartups.foundersColumn).toBe("Founders");
    expect(en.investigationsStartups.homepageColumn).toBe("Homepage");
    expect(en.investigationsStartups.tabJobs).toBe("Open positions");
    expect(en.investigationsStartups.jobsTitle).toBe("Open positions");
    expect(en.investigationsStartups.roleJoinCta).toBe(
      "Join the AIT community to get more",
    );
    expect(nl.investigationsStartups.roleJoinCta).toBe(
      "Word lid van de AIT-community voor meer",
    );
    expect(en.investigationsStartups.joinCta).toBe("Join the Hub");
    expect(nl.investigationsStartups.tabJobs).toBe("Open posities");
    expect(nl.investigationsStartups.foundersColumn).toBe("Oprichters");
    expect(nl.investigationsStartups.homepageColumn).toBe("Homepage");
    expect(nl.investigationsStartups.viewMap).toBe("Kaart");
    expect(nl.investigationsStartups.viewTable).toBe("Tabel");
    expect(nl.investigationsStartups.mapEmpty).toBe(
      "Nog geen locaties op de lijst.",
    );
    expect(en.investigationsStartups.sectionFounders).toBe("Founders");
    expect(en.investigationsStartups.sectionHiring).toBe("Open roles");
    expect(en.investigationsStartups.sectionNews).toBe("In the news");
    expect(nl.investigationsStartups.sectionFounders).toBe("Oprichters");
    expect(nl.investigationsStartups.sectionHiring).toBe("Open posities");
    expect(nl.investigationsStartups.sectionNews).toBe("In het nieuws");
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

describe("Startups profile page", () => {
  it("renders a thin record as a facts sheet with no empty sections", () => {
    const { container } = render(
      <StartupsProfilePage
        locale="en"
        t={profileT("en")}
        card={FIXTURE_CARD}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Fixture Co" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open homepage" })).toHaveAttribute(
      "href",
      "https://fixture.example",
    );
    expect(hrefsOf(container)).toContain(STARTUPS_PATH);
    expect(hrefsOf(container)).toContain(STARTUPS_JOIN_HREF);
    expect(
      container.querySelector("[data-startup-profile-layout]"),
    ).toHaveAttribute("data-startup-profile-layout", "sheet");
    expect(
      container.querySelector("[data-startup-profile-section]"),
    ).toBeNull();
    expect(
      [...container.querySelectorAll("[data-startup-fact]")].map((node) =>
        node.getAttribute("data-startup-fact"),
      ),
    ).toEqual(["region", "listed", "sources"]);
    expect(container.querySelector("[data-startup-region]")?.textContent).toBe(
      "Toronto, Canada",
    );
    expect(container.querySelector("[data-startup-coords]")?.textContent).toBe(
      "≈ 43.7° N, 79.4° W",
    );
    expect(container.querySelector("[data-startup-logo]")).toBeNull();
    expect(
      container.querySelector("[data-startup-monogram]")?.textContent,
    ).toBe("FC");
    expect(container.querySelector("[data-startup-description]")).toBeNull();
    expect(container.querySelector("[data-startup-stage]")).toBeNull();
    expect(container.querySelector("[data-startup-exit]")).toBeNull();
    expect(container.querySelector("[data-startup-jobs]")).toBeNull();
    const data = JSON.parse(
      container.querySelector("script[type='application/ld+json']")
        ?.textContent ?? "null",
    ) as { description?: string; url?: string };
    expect(data.url).toBe("https://fixture.example");
    expect(data).not.toHaveProperty("description");
    expect(container.textContent).not.toMatch(BANNED);
    expect(container.textContent).not.toContain("—");
  });

  it("shows sourced sections only and never invents founder, role, or press copy", () => {
    const { container } = render(
      <StartupsProfilePage
        locale="en"
        t={profileT("en")}
        card={{
          ...FIXTURE_CARD,
          description: "Sourced short blurb from Pulse.",
          logoUrl: "https://fixture.example/logo.png",
          stage: "Series B",
          exitStatus: "acquired",
          acquirer: "SpaceX",
          exitOn: "2026",
          jobsUrl: "https://fixture.example/careers",
          openRoleCount: 1,
          founders: [{ name: "Ada Example", url: null, imageUrl: null }],
          sources: [
            "https://fixture.example/about",
            "https://fixture.example/newsroom",
          ],
        }}
        roles={[{ ...FIXTURE_ROLE, workType: "Full-time" }]}
      />,
    );
    expect(
      container.querySelector("[data-startup-profile-layout]"),
    ).toHaveAttribute("data-startup-profile-layout", "dossier");
    expect(
      [...container.querySelectorAll("[data-startup-profile-section]")].map(
        (node) => node.getAttribute("data-startup-profile-section"),
      ),
    ).toEqual(["founders", "hiring", "news"]);
    expect(
      screen.getByRole("heading", { level: 2, name: /Open roles/ }),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-startup-logo]")).toHaveAttribute(
      "src",
      "https://fixture.example/logo.png",
    );
    expect(container.querySelector("[data-startup-monogram]")).toBeNull();
    expect(
      container.querySelector("[data-startup-description]")?.textContent,
    ).toBe("Sourced short blurb from Pulse.");
    expect(container.querySelector("[data-startup-exit]")).toHaveAttribute(
      "data-startup-exit",
      "acquired",
    );
    expect(container.querySelector("[data-startup-stage]")?.textContent).toBe(
      "Series B",
    );
    expect(container.querySelector("[data-startup-jobs]")).toHaveAttribute(
      "href",
      "/jobs?company=fixture-co",
    );
    expect(container.querySelector("[data-startup-jobs]")?.textContent).toBe(
      "1 open role",
    );
    expect(container.querySelector("[data-startup-all-roles]")).toHaveAttribute(
      "href",
      "/jobs?company=fixture-co",
    );
    expect(
      screen.getByRole("link", { name: "Staff Engineer" }),
    ).toHaveAttribute("href", "/jobs/fixture-co-staff-engineer");
    expect(
      container.querySelector("[data-startup-hiring-location]")?.textContent,
    ).toBe("Toronto, Canada");
    expect(
      container.querySelector("[data-startup-hiring-work-type]")?.textContent,
    ).toBe("Full-time");
    expect(
      container.querySelector("[data-startup-founder-name='Ada Example']"),
    ).not.toBeNull();
    const news = container.querySelector("[data-startup-profile-section=news]");
    expect(
      [...(news?.querySelectorAll("[data-startup-source-chip]") ?? [])].map(
        (node) => node.getAttribute("href"),
      ),
    ).toEqual(["https://fixture.example/newsroom"]);
    const sources = container.querySelector("[data-startup-fact=sources]");
    expect(
      [...(sources?.querySelectorAll("[data-startup-source-chip]") ?? [])].map(
        (node) => node.getAttribute("href"),
      ),
    ).toEqual(["https://fixture.example/about"]);
    const data = JSON.parse(
      container.querySelector("script[type='application/ld+json']")
        ?.textContent ?? "null",
    ) as { description?: string };
    expect(data.description).toBe("Sourced short blurb from Pulse.");
    expect(JSON.stringify(data)).not.toContain("Person");
  });

  it("uses Dutch profile section and fact copy", () => {
    render(
      <StartupsProfilePage
        locale="nl"
        t={profileT("nl")}
        card={{
          ...FIXTURE_CARD,
          jobsUrl: "https://fixture.example/careers",
          openRoleCount: 1,
          founders: [{ name: "Ada Example", url: null, imageUrl: null }],
          sources: ["https://fixture.example/newsroom"],
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 2, name: /Oprichters/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /Open posities/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: /In het nieuws/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("In het kort")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Bekijk de 1 open positie/ }),
    ).toBeInTheDocument();
  });

  it("keeps event handlers behind client boundaries so profile SSR cannot throw", () => {
    const chips = readFileSync(join(dir, "startups-source-chips.tsx"), "utf8");
    const serverFiles = [
      "startups-profile.tsx",
      "startups-profile-header.tsx",
      "startups-profile-sections.tsx",
      "startups-profile-facts.tsx",
    ].map((file) => readFileSync(join(dir, file), "utf8"));
    const route = readFileSync(PROFILE_FILE, "utf8");
    expect(serverFiles.join("\n")).toContain("StartupsSourceChips");
    expect(chips).toMatch(/^["']use client["']/);
    for (const source of [...serverFiles, route]) {
      expect(source).not.toMatch(/^["']use client["']/);
      expect(source).not.toMatch(/\bon(?:Error|Click|Change|Load)\s*=/);
    }
  });
});

describe("Startups open positions", () => {
  it("renders an empty jobs table without inventing roles", () => {
    const { container } = render(
      <StartupsJobsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        roles={[]}
        query={{
          company: "",
          q: "",
          location: "",
          workType: "",
          sort: "role",
          page: 1,
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Open positions" }),
    ).toBeInTheDocument();
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain(
      en.investigationsStartups.jobsEmpty,
    );
    expect(
      screen.getByRole("link", { name: en.investigationsStartups.joinCta }),
    ).toHaveAttribute("href", STARTUPS_JOIN_HREF);
    expect(container.textContent).not.toContain("Directory: Directory");
    expect(container.querySelector("main")?.className.split(/\s+/)).toContain(
      "max-w-6xl",
    );
    expect(hrefsOf(container)).toContain(STARTUPS_PATH);
    expect(hrefsOf(container)).toContain(STARTUPS_PATH);
    expect(hrefsOf(container)).toContain(STARTUPS_JOBS_PATH);
    expect(container.textContent).not.toMatch(BANNED);
  });

  it("lists sourced roles and never invents salary or fit copy", () => {
    const { container } = render(
      <StartupsJobsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        roles={[FIXTURE_ROLE]}
        query={{
          company: "",
          q: "",
          location: "",
          workType: "",
          sort: "role",
          page: 1,
        }}
      />,
    );
    expect(
      screen.getByRole("link", { name: "Staff Engineer" }),
    ).toHaveAttribute("href", "/jobs/fixture-co-staff-engineer");
    expect(screen.getByRole("link", { name: "Role" })).toHaveAttribute(
      "href",
      "/jobs",
    );
    expect(screen.getByRole("link", { name: "Company" })).toHaveAttribute(
      "href",
      "/jobs?sort=company",
    );
    expect(screen.getByLabelText("Search roles…")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by work type")).toBeInTheDocument();
    expect(container.querySelector("[data-startup-jobs-follow]")).toBeNull();
    expect(screen.queryByRole("button", { name: "Track" })).toBeNull();
    expect(screen.getByRole("link", { name: "Fixture Co" })).toHaveAttribute(
      "href",
      "/startups/fixture-co",
    );
    expect(
      container.querySelector("[data-startup-role-location]")?.textContent,
    ).toBe("Toronto, Canada");
    expect(container.textContent).not.toMatch(BANNED);
    expect(container.textContent).not.toMatch(/\$\d|€\d/);
  });

  it("follows a filtered search and lists roles added since the last look without a publish date", () => {
    const listedAt = "2026-09-22T08:00:00.000Z";
    const { container } = render(
      <StartupsJobsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        promoteJoin={false}
        roles={[
          {
            ...FIXTURE_ROLE,
            workType: "Full-time",
            listedAt,
          },
        ]}
        query={{
          company: "fixture-co",
          q: "",
          location: "",
          workType: "Full-time",
          sort: "role",
          page: 1,
        }}
        follow={{
          company: "fixture-co",
          q: "",
          location: "",
          workType: "Full-time",
        }}
        following
        newRoles={[
          {
            slug: FIXTURE_ROLE.slug,
            title: FIXTURE_ROLE.title,
            startupName: FIXTURE_ROLE.startupName,
          },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Stop following" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /New since you last looked/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("New").length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain(listedAt);
    expect(container.textContent).not.toContain("2026-09-22");
    expect(screen.getByRole("button", { name: "Track" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("marks a tracked role for a signed-in member and hides Track from guests", () => {
    const { unmount } = render(
      <StartupsJobsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        promoteJoin={false}
        trackedRoleIds={[FIXTURE_ROLE.id]}
        roles={[FIXTURE_ROLE]}
        query={{
          company: "",
          q: "",
          location: "",
          workType: "",
          sort: "role",
          page: 1,
        }}
      />,
    );
    const tracking = screen.getByRole("button", { name: "Tracking" });
    expect(tracking).toHaveAttribute("aria-pressed", "true");
    expect(tracking).toHaveAttribute("data-startup-track", "");
    unmount();

    render(
      <StartupsJobsPage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        roles={[FIXTURE_ROLE]}
        query={{
          company: "",
          q: "",
          location: "",
          workType: "",
          sort: "role",
          page: 1,
        }}
      />,
    );
    expect(screen.queryByRole("button", { name: "Track" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Tracking" })).toBeNull();
  });

  it("keeps the original careers URL on the dedicated role page", () => {
    const { container } = render(
      <StartupsRolePage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        role={FIXTURE_ROLE}
      />,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Staff Engineer" }),
    ).toBeInTheDocument();
    expect(container.querySelector("main")?.className.split(/\s+/)).toContain(
      "max-w-6xl",
    );
    expect(
      container.querySelector("main")?.className.split(/\s+/),
    ).not.toContain("max-w-3xl");
    expect(
      screen.getByRole("link", { name: "Open original posting" }),
    ).toHaveAttribute("href", "https://fixture.example/careers/staff");
    expect(
      container.querySelector("[data-startup-role-description]")?.textContent,
    ).toBe("Build the product.");
    expect(
      container.querySelector("[data-startup-role-description]")?.tagName,
    ).toBe("ARTICLE");
    expect(
      container.querySelector("[data-startup-role-description]")?.className,
    ).not.toMatch(/whitespace-pre-wrap/);
    expect(hrefsOf(container)).toContain(STARTUPS_JOBS_PATH);
    const join = screen.getByRole("link", {
      name: en.investigationsStartups.roleJoinCta,
    });
    expect(join).toHaveAttribute("href", JOBS_ROLE_JOIN_HREF);
    expect(join.getAttribute("href")).toContain("/en/join");
    expect(join.getAttribute("href")).toContain("utm_source=aitcom");
    expect(join.getAttribute("href")).toContain("utm_medium=jobs");
    expect(join.getAttribute("href")).toContain("utm_campaign=jobs");
    expect(container.textContent).not.toMatch(/Join the Hub/i);
    expect(hrefsOf(container)).not.toContain(STARTUPS_JOIN_HREF);
    expect(container.textContent).not.toMatch(BANNED);
    expect(container.querySelector("[data-startup-role-member]")).toBeNull();
    expect(container.textContent).not.toContain(
      en.investigationsStartups.roleBriefTitle,
    );
    expect(container.textContent).not.toContain(
      en.investigationsStartups.copyPromptTitle,
    );
    expect(container.textContent).not.toContain(
      en.investigationsStartups.cvTitle,
    );
    expect(
      container.querySelector("script[type='application/ld+json']"),
    ).toBeNull();
  });

  it("emits JobPosting JSON-LD only when the ATS published a date", () => {
    const { container } = render(
      <StartupsRolePage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        role={{
          ...FIXTURE_ROLE,
          postedAt: "2026-03-01T12:00:00.000Z",
          location: "San Francisco, CA | Seattle, WA",
          workType: "Full-time",
        }}
      />,
    );
    const data = JSON.parse(
      container.querySelector("script[type='application/ld+json']")
        ?.textContent ?? "null",
    ) as {
      "@type"?: string;
      datePosted?: string;
      jobLocation?: unknown;
    };
    expect(data["@type"]).toBe("JobPosting");
    expect(data.datePosted).toBe("2026-03-01");
    expect(JSON.stringify(data)).not.toMatch(
      /streetAddress|postalCode|baseSalary|validThrough|employmentType|2026-09-20/,
    );
    expect(data.jobLocation).toEqual([
      {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "San Francisco",
          addressRegion: "CA",
        },
      },
      {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Seattle",
          addressRegion: "WA",
        },
      },
    ]);
  });

  it("shows a sourced Role Brief, copy prompt, and CV upload for Hub members", () => {
    const { container } = render(
      <StartupsRolePage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        role={{
          ...FIXTURE_ROLE,
          title: "Senior Staff Engineer",
          descriptionText: `Requirements:
- 5 years shipping TypeScript
- English

Nice to have:
- Dutch`,
        }}
        promoteJoin={false}
      />,
    );
    expect(
      container.querySelector("[data-startup-role-member]"),
    ).not.toBeNull();
    expect(container.textContent).toContain(
      en.investigationsStartups.roleBriefTitle,
    );
    expect(container.textContent).toContain("5 years shipping TypeScript");
    expect(container.textContent).toContain("Dutch");
    const prompt =
      container.querySelector("[data-startup-role-prompt]")?.textContent ?? "";
    expect(prompt).toContain("https://fixture.example/careers/staff");
    expect(prompt).toMatch(/do not invent employers/i);
    expect(prompt).toContain("Paste my CV below.");
    expect(
      screen.getByRole("button", {
        name: en.investigationsStartups.copyPromptCta,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: en.investigationsStartups.cvUpload }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: en.investigationsStartups.applyingCta,
      }),
    ).toBeInTheDocument();
    expect(container.querySelector("[data-startup-applying]")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(hrefsOf(container)).not.toContain(STARTUPS_JOIN_HREF);
    expect(hrefsOf(container)).not.toContain(JOBS_ROLE_JOIN_HREF);
    expect(container.textContent).not.toMatch(/Join the Hub/i);
    expect(container.textContent).not.toContain(
      en.investigationsStartups.roleJoinCta,
    );
    expect(
      screen.getByRole("link", { name: en.investigationsStartups.hubCta }),
    ).toHaveAttribute("href", HUB_OPEN_HREF);
    expect(container.textContent).not.toMatch(BANNED);
    expect(container.textContent).not.toMatch(/salary|fit score/i);
  });

  it("uses the Dutch role join label on the same hard /en/join jobs door", () => {
    render(
      <StartupsRolePage
        locale="nl"
        t={tFrom(nl.investigationsStartups)}
        role={FIXTURE_ROLE}
      />,
    );
    const join = screen.getByRole("link", {
      name: nl.investigationsStartups.roleJoinCta,
    });
    expect(nl.investigationsStartups.roleJoinCta).not.toMatch(/Hub/i);
    expect(join).toHaveAttribute("href", JOBS_ROLE_JOIN_HREF);
    expect(join.getAttribute("href")).toContain("/en/join");
    expect(join.getAttribute("href")).toContain("utm_campaign=jobs");
  });

  it("renders sourced headings and bullets instead of a pre-wrapped dump", () => {
    const { container } = render(
      <StartupsRolePage
        locale="en"
        t={tFrom(en.investigationsStartups)}
        role={{
          ...FIXTURE_ROLE,
          descriptionText: `About the role
Build the product.

Requirements:
- 5 years shipping TypeScript
- English`,
        }}
      />,
    );
    const posting = container.querySelector("[data-startup-role-description]");
    expect(posting?.className.split(/\s+/)).toContain("max-w-prose");
    expect(posting?.className).not.toMatch(/whitespace-pre-wrap/);
    expect(
      screen.getByRole("heading", { level: 2, name: "About the role" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Requirements" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(posting?.textContent).toContain("Build the product.");
    expect(posting?.textContent).toContain("5 years shipping TypeScript");
    expect(posting?.textContent).not.toMatch(/salary|fit score/i);
  });
});

describe("Startups site integration", () => {
  it("is in the sitemap and investigations index", () => {
    const sitemap = readFileSync(SITEMAP_FILE, "utf8");
    expect(sitemap).toContain("startupDirectorySitemapPaths");
    expect(sitemap).toContain("startupProfileSitemapPaths");
    expect(sitemap).toContain("listApprovedPublicStartupSlugs");
    expect(sitemap).toContain("listedPublicStartupCount");
    expect(readFileSync(SITEMAP_TEST_FILE, "utf8")).toContain(STARTUPS_PATH);
    expect(readFileSync(INDEX_FILE, "utf8")).toContain(STARTUPS_PATH);
  });

  it("maps www cite URLs onto the investigation path", () => {
    expect(
      appPathFromGuideHref("https://www.aitcommunity.org/en/startups"),
    ).toBe(STARTUPS_PATH);
    expect(
      appPathFromGuideHref("https://www.aitcommunity.org/en/startups/insights"),
    ).toBe(STARTUPS_INSIGHTS_PATH);
    expect(appPathFromGuideHref("/en/startups?tab=insights")).toBe(
      STARTUPS_INSIGHTS_PATH,
    );
    expect(
      appPathFromGuideHref("https://www.aitcommunity.org/en/startups/jobs"),
    ).toBe(STARTUPS_JOBS_PATH);
    expect(appPathFromGuideHref("https://www.aitcommunity.org/en/jobs")).toBe(
      STARTUPS_JOBS_PATH,
    );
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
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/promo-only/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/Do \*\*not\*\* noindex/);
    expect(readFileSync(FIXTURE, "utf8")).toContain("jobs_url");
    expect(readFileSync(FIXTURE, "utf8")).toContain('"status": "ipo"');
    expect(readFileSync(SOFT_OMIT_MIGRATION_FILE, "utf8")).toContain(
      "jobs_url",
    );
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/description|blurb/i);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/sticky \*\*Company\*\*/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/\*\*Status\*\*/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/Open positions/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/Role Brief/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/startup_member_cv/);
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/overflow/);
    expect(
      existsSync(join(dir, "../../migrations/20260920a_startup_roles.ts")),
    ).toBe(true);
    expect(
      readFileSync(join(dir, "../../../next.config.js"), "utf8"),
    ).toContain("/investigations/startups");
    expect(readFileSync(join(dir, "../../../vercel.json"), "utf8")).toContain(
      "/api/cron/startup-jobs-scan",
    );
    expect(existsSync(CV_MIGRATION_FILE)).toBe(true);
    expect(readFileSync(CV_MIGRATION_FILE, "utf8")).toContain(
      "startup_member_cv",
    );
    expect(readFileSync(CV_MIGRATION_FILE, "utf8")).toContain(
      "startup_role_applications",
    );
    expect(readFileSync(CV_MIGRATION_FILE, "utf8")).toMatch(
      /ON DELETE CASCADE/,
    );
    expect(readFileSync(CV_MIGRATION_FILE, "utf8")).not.toMatch(/INSERT INTO/i);
    expect(existsSync(OPEN_ROLE_COUNT_MIGRATION_FILE)).toBe(true);
    expect(readFileSync(OPEN_ROLE_COUNT_MIGRATION_FILE, "utf8")).toContain(
      "open_role_count",
    );
    expect(readFileSync(OPEN_ROLE_COUNT_MIGRATION_FILE, "utf8")).not.toMatch(
      /INSERT INTO/i,
    );
    expect(readFileSync(QUERIES_FILE, "utf8")).toContain("row.openRoleCount");
    expect(readFileSync(OPS_DOC, "utf8")).toMatch(/open_role_count/);
  });

  it("lists sourced jobs at /jobs in the primary nav without colliding with Hub roles", () => {
    const nav = readFileSync(NAV_FILE, "utf8");
    const footer = readFileSync(FOOTER_FILE, "utf8");
    const nextConfig = readFileSync(
      join(dir, "../../../next.config.js"),
      "utf8",
    );
    expect(nav).toMatch(/href: "\/startups",[\s\S]*?primary: true/);
    expect(nav).toContain('key: "startups"');
    expect(nav).toContain('shortcut: "U"');
    expect(nav).toMatch(/href: "\/jobs",[\s\S]*?primary: true/);
    expect(nav).toMatch(/href: "\/roles",[\s\S]*?primary: true/);
    expect(nav).not.toMatch(/href: "\/startups\/jobs"/);
    expect(readFileSync(JOBS_FILE, "utf8")).toContain("listPublicStartupRoles");
    expect(readFileSync(JOBS_FILE, "utf8")).not.toContain('collection: "jobs"');
    expect(nextConfig).toContain("/startups/jobs");
    expect(nextConfig).toContain("/communities/:slug/jobs");
    expect(nextConfig).toContain('destination: "/:locale/jobs"');
    expect(
      existsSync(join(appLocale, "communities/[slug]/jobs/page.tsx")),
    ).toBe(false);
    expect(footer).toContain('href="/jobs"');
    expect(footer).toContain('tNav("jobs")');
    expect(footer).toContain('href="/startups"');
    expect(footer).toContain('tNav("startups")');
    expect(en.nav.startups).toBe("Startups");
    expect(nl.nav.startups).toBe("Startups");
    expect(en.nav.jobs).toBe("Jobs");
    expect(en.nav.roles).toBe("Roles");
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
    expect(ROLE_FILE).toBeTruthy();
    const roleSrc = readFileSync(ROLE_FILE, "utf8");
    expect(roleSrc).toContain("shouldPromoteJoin");
    expect(roleSrc).toContain("promoteJoin");
    const desk = readFileSync(MEMBER_DESK_FILE, "utf8");
    expect(desk).toContain("getMyCv");
    expect(desk).toContain("upsertMyCv");
    expect(desk).toContain("deleteMyCv");
    expect(desk).not.toMatch(/openrouter/i);
    expect(desk).not.toContain("/api/upload");
    expect(readFileSync(ROUTER_FILE, "utf8")).toContain("protectedProcedure");
    expect(insights).toContain("listApprovedPublicStartups");
    expect(insights).toContain("shouldPromoteJoin");
    expect(insights).toContain("promoteJoin");
    expect(insights).toContain('dynamic = "force-dynamic"');
    expect(queries).not.toMatch(/unstable_cache|revalidateTag/);
    expect(submit).toContain("router.refresh()");

    expect(pagination).toContain("buildStartupDirectoryPath");
    expect(pagination).toContain("<Link");
    expect(pagination).not.toMatch(/onClick=\{[^}]*page/);

    expect(sitemap).toContain("listedPublicStartupCount");
    expect(sitemap).toContain("startupDirectorySitemapPaths(listed)");
    expect(sitemap).toContain("startupProfileSitemapPaths(slugs)");
    expect(sitemap).toContain("noStore");
    expect(sitemap).toContain('"/startups"');
    expect(sitemap).toContain('"/jobs"');
    expect(sitemap).not.toContain('"/startups/jobs"');
    expect(sitemap).toContain("startupRoleSitemapPaths");
    expect(sitemap).not.toContain("startupInvestigationSitemapPaths");
    expect(sitemap).not.toContain("filterUnlistedStartupSitemapEntries");
  });

  it("does not bake Pulse company names into UI components or queries", () => {
    for (const file of [
      ...componentSources(),
      PAGE_FILE,
      PROFILE_FILE,
      INSIGHTS_FILE,
      MIGRATION_FILE,
      QUERIES_FILE,
    ]) {
      expect(readFileSync(file, "utf8")).not.toMatch(BAKED_COMPANIES);
    }
  });
});
