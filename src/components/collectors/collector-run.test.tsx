import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({
  run: vi.fn(),
  items: vi.fn(),
  overview: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    collectors: {
      run: { useQuery: h.run },
      items: { useQuery: h.items },
      overview: { useQuery: h.overview },
    },
  },
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

import { CollectorRun, runPollInterval } from "./collector-run";

const base = {
  id: "run-1",
  collectorId: "feed-items",
  collectorVersion: 1,
  origin: "web",
  agentId: null,
  input: { url: "https://blog.example.org/feed.xml" },
  pagesFetched: 20,
  bytesFetched: 1000,
  itemCount: 2,
  invalidItemCount: 1,
  durationMs: 41000,
  error: null,
  log: ["Page 20 of 20 read."],
  createdAt: "2026-10-03T11:58:00.000Z",
  startedAt: "2026-10-03T11:58:01.000Z",
  finishedAt: "2026-10-03T11:58:42.000Z",
  expiresAt: "2026-11-02T11:58:00.000Z",
};

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
});

function renderRun() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-10-03T12:00:00Z")}
      timeZone="UTC"
    >
      <CollectorRun runId="run-1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.overview.mockReturnValue(
    ok({
      collectors: [{ id: "feed-items", title: "Feed items" }],
      recentRuns: [],
      usage: { runsToday: 0, runsPerDay: 20 },
      needsAcknowledgement: false,
    }),
  );
  h.items.mockReturnValue(
    ok({
      items: [
        { title: "Release notes", url: "https://blog.example.org/r" },
        { title: "Recap", url: null },
      ],
      nextSeq: null,
    }),
  );
});

describe("runPollInterval", () => {
  it("polls every 3 seconds while the run is active and stops when it ends", () => {
    expect(runPollInterval({ status: "queued" })).toBe(3000);
    expect(runPollInterval({ status: "running" })).toBe(3000);
    expect(runPollInterval({ status: "succeeded" })).toBe(false);
    expect(runPollInterval({ status: "failed" })).toBe(false);
    expect(runPollInterval(undefined)).toBe(3000);
  });
});

describe("CollectorRun", () => {
  it("asks for this run and polls by the run's own status", () => {
    h.run.mockReturnValue(ok({ ...base, status: "running", stopReason: null }));
    renderRun();
    expect(h.run).toHaveBeenCalledWith(
      { runId: "run-1" },
      expect.objectContaining({ refetchInterval: expect.any(Function) }),
    );
    const [, options] = h.run.mock.calls[0] as [
      unknown,
      { refetchInterval: (q: { state: { data: unknown } }) => unknown },
    ];
    expect(
      options.refetchInterval({ state: { data: { status: "succeeded" } } }),
    ).toBe(false);
  });

  it("explains a partial run and offers both downloads", () => {
    h.run.mockReturnValue(
      ok({ ...base, status: "succeeded", stopReason: "page_limit" }),
    );
    renderRun();
    expect(screen.getByText(en.collectors.status.partial)).toBeInTheDocument();
    expect(screen.getByText(en.collectors.stop.page_limit)).toBeInTheDocument();
    expect(
      screen.getByText("2 rows · 20 pages fetched · 1 row skipped"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.collectors.run.downloadCsv }),
    ).toHaveAttribute("href", "/api/collectors/runs/run-1/export?format=csv");
    expect(
      screen.getByRole("link", { name: en.collectors.run.downloadJson }),
    ).toHaveAttribute("href", "/api/collectors/runs/run-1/export?format=json");
    expect(
      screen.getByRole("cell", { name: "Release notes" }),
    ).toBeInTheDocument();
    expect(h.items).toHaveBeenCalledWith(
      { runId: "run-1", afterSeq: -1, limit: 50 },
      expect.anything(),
    );
  });

  it("shows the failure reason and no downloads for a failed run with no rows", () => {
    h.run.mockReturnValue(
      ok({
        ...base,
        status: "failed",
        stopReason: "robots_disallowed",
        itemCount: 0,
      }),
    );
    renderRun();
    expect(
      screen.getByText(en.collectors.stop.robots_disallowed),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: en.collectors.run.downloadCsv }),
    ).toBeNull();
  });

  it("says the run was not found for a missing or foreign run", () => {
    h.run.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      error: { data: { code: "NOT_FOUND" } },
      refetch: vi.fn(),
    });
    renderRun();
    expect(screen.getByText(en.collectors.run.notFound)).toBeInTheDocument();
  });
});
