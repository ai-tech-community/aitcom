import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLLECTOR_ABOUT_PATH } from "@/server/collectors/identity";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({
  overview: vi.fn(),
  fetch: vi.fn(),
  push: vi.fn(),
  pathname: "/dashboard/collectors",
}));

vi.mock("@/trpc/react", () => ({
  api: {
    collectors: { overview: { useQuery: h.overview } },
    useUtils: () => ({ collectors: { recognize: { fetch: h.fetch } } }),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push }),
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import {
  activeEntry,
  CollectorWorkspace,
  railGroups,
} from "./collector-workspace";

const preset = (
  id: string,
  group: "jobs" | "research" | "custom",
  title: string,
) => ({
  id,
  group,
  title,
  summary: "",
  collectorId: "x",
  base: {},
  ask: ["url"],
  fields: [],
});
const presets = [
  preset("feed", "research", "News or blog feed"),
  preset("custom-page", "custom", "Custom page"),
  preset("greenhouse-board", "jobs", "Greenhouse board"),
];

function renderWorkspace(pathname = "/dashboard/collectors") {
  h.pathname = pathname;
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CollectorWorkspace>
        <p>Page content</p>
      </CollectorWorkspace>
    </NextIntlClientProvider>,
  );
}

const wide = () =>
  within(document.querySelector<HTMLElement>('[data-slot="rail-wide"]')!);
const picker = () =>
  document.querySelector<HTMLElement>('[data-slot="rail-picker"]')!;

beforeEach(() => {
  vi.clearAllMocks();
  h.overview.mockReturnValue({
    data: {
      collectors: [],
      presets,
      recentRuns: [],
      usage: { runsToday: 1, runsPerDay: 20 },
      needsAcknowledgement: false,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("activeEntry", () => {
  it.each([
    ["/dashboard/collectors", { kind: "home" }],
    ["/dashboard/collectors/runs", { kind: "runs" }],
    ["/dashboard/collectors/runs/abc", { kind: "runs" }],
    ["/dashboard/collectors/new/feed", { kind: "preset", presetId: "feed" }],
    ["/dashboard/collectors/new/a%20b", { kind: "preset", presetId: "a b" }],
    [
      "/dashboard/collectors/new/%E0%A4%A",
      { kind: "preset", presetId: "%E0%A4%A" },
    ],
    ["/dashboard/collectors/elsewhere", { kind: "home" }],
  ])("reads %s", (pathname, entry) => {
    expect(activeEntry(pathname)).toEqual(entry);
  });
});

describe("railGroups", () => {
  it("orders jobs, research, then custom, and drops empty groups", () => {
    expect(railGroups(presets).map((g) => g.group)).toEqual([
      "jobs",
      "research",
      "custom",
    ]);
    expect(railGroups(presets.slice(0, 2)).map((g) => g.group)).toEqual([
      "research",
      "custom",
    ]);
  });
});

describe("CollectorWorkspace", () => {
  it("lists sites by group with Custom page last and My runs after it", () => {
    renderWorkspace();
    expect(
      wide()
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([
      "Greenhouse board",
      "News or blog feed",
      "Custom page",
      en.collectors.workspace.myRuns,
    ]);
    expect(
      wide().getByText(en.collectors.workspace.group.jobs),
    ).toBeInTheDocument();
    expect(
      wide().getByText(en.collectors.workspace.group.research),
    ).toBeInTheDocument();
    expect(wide().getByRole("link", { name: "Custom page" })).toHaveAttribute(
      "href",
      "/dashboard/collectors/new/custom-page",
    );
  });

  it("marks the open preset as the current page, and only that one", () => {
    renderWorkspace("/dashboard/collectors/new/feed");
    const current = wide()
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["News or blog feed"]);
  });

  it("marks My runs on a run page", () => {
    renderWorkspace("/dashboard/collectors/runs/abc");
    expect(
      wide().getByRole("link", { name: en.collectors.workspace.myRuns }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("names the open entry in the narrow-screen picker", () => {
    renderWorkspace("/dashboard/collectors/new/feed");
    expect(picker().tagName).toBe("DETAILS");
    expect(picker().querySelector("summary")).toHaveTextContent(
      `${en.collectors.workspace.picker} News or blog feed`,
    );
    expect(
      within(picker())
        .getAllByRole("link")
        .map((a) => a.textContent),
    ).toEqual([
      "Greenhouse board",
      "News or blog feed",
      "Custom page",
      en.collectors.workspace.myRuns,
    ]);
  });

  it("asks the member to choose in the picker on the landing", () => {
    renderWorkspace("/dashboard/collectors");
    expect(picker().querySelector("summary")).toHaveTextContent(
      en.collectors.workspace.pickerNone,
    );
  });

  it("shows the page beside the rail, with no breadcrumb or kicker", () => {
    renderWorkspace();
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });

  it("shows the member's usage and how collecting works under the list", () => {
    renderWorkspace();
    expect(
      screen.getByText("1 of 20 runs used · last 24 hours"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.collectors.aboutLink }),
    ).toHaveAttribute("href", COLLECTOR_ABOUT_PATH);
  });

  it("offers a retry in the rail when the sites can't load", () => {
    const refetch = vi.fn();
    h.overview.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    renderWorkspace();
    expect(wide().getByRole("alert")).toBeInTheDocument();
  });
});
