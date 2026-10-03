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

import { CollectorsHome, runTarget } from "./collectors-home";

const feed = {
  id: "feed-items",
  kind: "feed",
  title: "Feed items",
  description: "The latest items of an RSS or Atom feed.",
  fields: [
    { name: "url", label: "Feed address", help: null, placeholder: null },
  ],
  inputJsonSchema: {},
  sampleItem: { title: "Release notes", url: "https://example.com/r" },
  limits: { maxPages: 1, maxItems: 1000, maxDurationMs: 60000 },
};

function ok(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

function renderHome() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-10-03T12:00:00Z")}
      timeZone="UTC"
    >
      <CollectorsHome />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  overview.mockReset();
});

describe("CollectorsHome", () => {
  it("asks for the overview in the member's language", () => {
    overview.mockReturnValue(
      ok({
        collectors: [],
        recentRuns: [],
        usage: { runsToday: 0, runsPerDay: 20 },
        needsAcknowledgement: true,
      }),
    );
    renderHome();
    expect(overview).toHaveBeenCalledWith({ locale: "en" });
  });

  it("lists collectors with a link to start each one", () => {
    overview.mockReturnValue(
      ok({
        collectors: [feed],
        recentRuns: [],
        usage: { runsToday: 3, runsPerDay: 20 },
        needsAcknowledgement: false,
      }),
    );
    renderHome();
    expect(
      screen.getByRole("heading", { name: "Feed items" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("3 of 20 runs used · last 24 hours"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.collectors.useCollector }),
    ).toHaveAttribute("href", "/dashboard/collectors/new/feed-items");
    expect(screen.getByText("You get: up to 1,000 rows")).toBeInTheDocument();
  });

  it("marks the collector kind as a neutral category badge", () => {
    overview.mockReturnValue(
      ok({
        collectors: [feed],
        recentRuns: [],
        usage: { runsToday: 0, runsPerDay: 20 },
        needsAcknowledgement: false,
      }),
    );
    renderHome();
    expect(screen.getByText(en.collectors.kind.feed)).toHaveAttribute(
      "data-variant",
      "secondary",
    );
  });

  it("teaches the next step when there are no runs yet", () => {
    overview.mockReturnValue(
      ok({
        collectors: [feed],
        recentRuns: [],
        usage: { runsToday: 0, runsPerDay: 20 },
        needsAcknowledgement: true,
      }),
    );
    renderHome();
    expect(screen.getByText(en.collectors.noRecentRuns)).toBeInTheDocument();
    expect(
      screen.getByText(en.collectors.noRecentRunsHint),
    ).toBeInTheDocument();
  });

  it("shows recent runs with their status and a link to each run", () => {
    overview.mockReturnValue(
      ok({
        collectors: [feed],
        recentRuns: [
          {
            id: "r1",
            collectorId: "feed-items",
            status: "succeeded",
            stopReason: "page_limit",
            input: { url: "https://blog.example.org/feed" },
            createdAt: "2026-10-03T10:00:00.000Z",
          },
        ],
        usage: { runsToday: 1, runsPerDay: 20 },
        needsAcknowledgement: false,
      }),
    );
    renderHome();
    expect(screen.getByText(en.collectors.status.partial)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Feed items/ })).toHaveAttribute(
      "href",
      "/dashboard/collectors/runs/r1",
    );
    expect(
      screen.getByRole("link", { name: en.collectors.seeAllRuns }),
    ).toHaveAttribute("href", "/dashboard/collectors/runs");
  });

  it("shows an error with retry when the overview fails", () => {
    const refetch = vi.fn();
    overview.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    renderHome();
    screen.getByRole("button", { name: en.common.retry }).click();
    expect(refetch).toHaveBeenCalled();
  });
});

describe("runTarget", () => {
  it("returns null for input that is not an object", () => {
    expect(runTarget(null)).toBeNull();
    expect(runTarget("https://example.com")).toBeNull();
    expect(runTarget(42)).toBeNull();
  });

  it("returns null when no input value is a string", () => {
    expect(runTarget({ limit: 5, deep: true })).toBeNull();
  });

  it("shows only the host for a URL whose path is /", () => {
    expect(runTarget({ url: "https://example.com/" })).toBe("example.com");
  });

  it("shows host and path for a URL with a path", () => {
    expect(runTarget({ url: "https://blog.example.org/feed?x=1" })).toBe(
      "blog.example.org/feed",
    );
  });

  it("returns a non-URL string as it is", () => {
    expect(runTarget({ limit: 3, query: "open data" })).toBe("open data");
  });
});
