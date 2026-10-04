import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const { overview } = vi.hoisted(() => ({ overview: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: { collectors: { overview: { useQuery: overview } } },
}));
vi.mock("@/i18n/navigation", () => ({
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

import { CollectorsLanding } from "./collectors-landing";

const run = {
  id: "run-1",
  collectorId: "feed-items",
  presetId: "feed",
  input: { url: "https://example.com/feed.xml" },
  status: "succeeded",
  stopReason: "complete",
  createdAt: "2026-10-04T10:00:00.000Z",
};

function withData(recentRuns: unknown[], extra: object = {}) {
  overview.mockReturnValue({
    data: {
      collectors: [{ id: "feed-items", title: "Feed items" }],
      presets: [{ id: "feed", title: "News or blog feed", ask: ["url"] }],
      titles: {
        presets: { feed: "News or blog feed", retired: "Old job board" },
        collectors: {
          "feed-items": "Feed items",
          "page-list": "Page list",
          "sitemap-links": "Sitemap links",
        },
      },
      recentRuns,
      usage: { runsToday: 0, runsPerDay: 20 },
      needsAcknowledgement: recentRuns.length === 0,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  });
}

function renderLanding() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      timeZone="UTC"
      now={new Date("2026-10-04T12:00:00Z")}
    >
      <CollectorsLanding />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("CollectorsLanding", () => {
  it("says how to start as its one heading, with no kicker", () => {
    withData([]);
    renderLanding();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      en.collectors.workspace.landing,
    ]);
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });

  it("shows only the line when there are no runs", () => {
    withData([]);
    renderLanding();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists the latest runs by name, with status and a link to each", () => {
    withData([run]);
    renderLanding();
    const list = screen.getByRole("list", {
      name: en.collectors.workspace.latestRuns,
    });
    expect(list).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "News or blog feed · example.com/feed.xml",
      }),
    ).toHaveAttribute("href", "/dashboard/collectors/runs/run-1");
    expect(screen.getByText(en.collectors.status.finished)).toBeInTheDocument();
  });

  it("names a run whose preset is switched off, gone, or from before presets", () => {
    withData([
      {
        ...run,
        id: "run-2",
        presetId: "retired",
        input: { board: "acme" },
      },
      {
        ...run,
        id: "run-3",
        collectorId: "page-list",
        presetId: "vanished",
        input: { url: "https://example.org/" },
      },
      {
        ...run,
        id: "run-4",
        collectorId: "sitemap-links",
        presetId: null,
        input: { pages: 3 },
      },
      {
        ...run,
        id: "run-5",
        presetId: null,
        input: { url: "https://example.com/old.xml" },
      },
    ]);
    renderLanding();
    expect(
      screen.getByRole("link", { name: "Old job board · acme" }),
    ).toHaveAttribute("href", "/dashboard/collectors/runs/run-2");
    expect(
      screen.getByRole("link", { name: "Page list · example.org" }),
    ).toHaveAttribute("href", "/dashboard/collectors/runs/run-3");
    // No text input: the title alone, without a dangling separator.
    const bare = screen.getByRole("link", { name: "Sitemap links" });
    expect(bare).toHaveAttribute("href", "/dashboard/collectors/runs/run-4");
    expect(bare.textContent).toBe("Sitemap links");
    // A run from before presets is named after the preset that replaced it.
    expect(
      screen.getByRole("link", {
        name: "News or blog feed · example.com/old.xml",
      }),
    ).toHaveAttribute("href", "/dashboard/collectors/runs/run-5");
  });

  it("polls every 5 seconds while a listed run is active", () => {
    withData([{ ...run, status: "running", stopReason: null }]);
    renderLanding();
    const options = overview.mock.calls.find(
      ([, o]) =>
        (o as { refetchInterval?: unknown } | undefined)?.refetchInterval,
    )![1] as {
      refetchInterval: (q: { state: { data: unknown } }) => number | false;
    };
    expect(
      options.refetchInterval({
        state: { data: { recentRuns: [{ status: "running" }] } },
      }),
    ).toBe(5000);
    expect(
      options.refetchInterval({
        state: { data: { recentRuns: [{ status: "failed" }] } },
      }),
    ).toBe(false);
  });

  it("keeps the line and stays quiet when the runs can't load", () => {
    overview.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch: vi.fn(),
    });
    renderLanding();
    expect(
      screen.getByRole("heading", { name: en.collectors.workspace.landing }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
  });
});
