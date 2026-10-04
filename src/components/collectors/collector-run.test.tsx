import { fireEvent, render, screen } from "@testing-library/react";
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
  presetId: null,
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

function runTree() {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-10-03T12:00:00Z")}
      timeZone="UTC"
    >
      <CollectorRun runId="run-1" />
    </NextIntlClientProvider>
  );
}

function renderRun() {
  return render(runTree());
}

type RunOptions = {
  refetchInterval: (q: {
    state: {
      status?: string;
      data: unknown;
      error?: { data?: { code?: string } } | null;
    };
  }) => unknown;
  retry: (count: number, error: { data?: { code?: string } }) => boolean;
};

const runOptions = () => h.run.mock.calls[0]![1] as RunOptions;

/** The `afterSeq` of the latest items request. */
const lastAfterSeq = () =>
  (h.items.mock.calls.at(-1)![0] as { afterSeq: number }).afterSeq;

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

  it("says why a failed run failed, in the member's words", () => {
    h.run.mockReturnValue(
      ok({
        ...base,
        status: "failed",
        stopReason: "error",
        itemCount: 0,
        error: "The feed answered with status 404.",
        errorDetail: { code: "feed_status", params: { status: 404 } },
      }),
    );
    renderRun();
    expect(screen.getByText(en.collectors.stop.error)).toBeInTheDocument();
    expect(
      screen.getByText(
        en.collectors.failure.feed_status.replace("{status}", "404"),
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("The feed answered with status 404.")).toBeNull();
  });

  it("never shows the server's English for an unknown failure code", () => {
    h.run.mockReturnValue(
      ok({
        ...base,
        status: "failed",
        stopReason: "error",
        itemCount: 0,
        error: "Some new server sentence.",
        errorDetail: { code: "something_new" },
      }),
    );
    renderRun();
    expect(screen.getByText(en.collectors.stop.error)).toBeInTheDocument();
    expect(screen.queryByText("Some new server sentence.")).toBeNull();
    expect(screen.queryByTestId("failure-detail")).toBeNull();
  });

  it("adds no failure detail when the run has none", () => {
    h.run.mockReturnValue(
      ok({
        ...base,
        status: "failed",
        stopReason: "robots_disallowed",
        itemCount: 0,
        errorDetail: null,
      }),
    );
    renderRun();
    expect(screen.queryByTestId("failure-detail")).toBeNull();
  });

  it("keeps polling through a passing error and stops only for a missing run", () => {
    const active = { ...base, status: "running", stopReason: null };
    h.run.mockReturnValue(ok(active));
    renderRun();
    const transient = {
      status: "error",
      data: active,
      error: { data: { code: "INTERNAL_SERVER_ERROR" } },
    };
    const missing = {
      status: "error",
      data: active,
      error: { data: { code: "NOT_FOUND" } },
    };
    expect(runOptions().refetchInterval({ state: transient })).toBe(3000);
    expect(runOptions().refetchInterval({ state: missing })).toBe(false);
    const itemOptions = h.items.mock.calls.at(-1)![1] as {
      refetchInterval: (q: { state: unknown }) => unknown;
    };
    expect(itemOptions.refetchInterval({ state: transient })).toBe(3000);
    expect(itemOptions.refetchInterval({ state: missing })).toBe(false);
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
    const options = runOptions();
    expect(
      options.refetchInterval({
        state: {
          status: "error",
          data: undefined,
          error: { data: { code: "NOT_FOUND" } },
        },
      }),
    ).toBe(false);
    expect(options.retry(0, { data: { code: "NOT_FOUND" } })).toBe(false);
    expect(options.retry(0, { data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(
      true,
    );
    expect(options.retry(3, { data: { code: "INTERNAL_SERVER_ERROR" } })).toBe(
      false,
    );
  });

  it("announces the final status, not only the live ones", () => {
    h.run.mockReturnValue(
      ok({ ...base, status: "succeeded", stopReason: "complete" }),
    );
    renderRun();
    expect(screen.getByRole("status")).toHaveTextContent(
      en.collectors.status.finished,
    );
  });

  it("leaves the current breadcrumb out until the run's title is known", () => {
    h.run.mockReturnValue({ ...ok(undefined), isPending: true });
    h.overview.mockReturnValue({ ...ok(undefined), isPending: true });
    renderRun();
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.querySelector('[aria-current="page"]')).toBeNull();
    expect(nav.textContent).toBe(
      `${en.collectors.breadcrumb.collectors}/${en.collectors.breadcrumb.runs}`,
    );
  });

  it("keeps polling a run that is still loading", () => {
    h.run.mockReturnValue({
      ...ok(undefined),
      isPending: true,
    });
    renderRun();
    expect(
      runOptions().refetchInterval({
        state: { status: "pending", data: undefined },
      }),
    ).toBe(3000);
  });

  it("says a queued run is waiting and that the page updates by itself", () => {
    h.run.mockReturnValue(
      ok({ ...base, status: "queued", stopReason: null, itemCount: 0 }),
    );
    renderRun();
    expect(screen.getByText(en.collectors.run.waiting)).toBeInTheDocument();
    expect(
      screen.getByText(en.collectors.run.collectingHelp),
    ).toBeInTheDocument();
  });

  it("says a running run is collecting and hides downloads until it ends", () => {
    h.run.mockReturnValue(ok({ ...base, status: "running", stopReason: null }));
    renderRun();
    expect(screen.getByText(en.collectors.run.collecting)).toBeInTheDocument();
    expect(
      screen.getByText(en.collectors.run.collectingHelp),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("cell", { name: "Release notes" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: en.collectors.run.downloadCsv }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: en.collectors.run.downloadJson }),
    ).toBeNull();
  });

  it("fetches the rows once more when the run ends", () => {
    const refetchItems = vi.fn();
    h.items.mockReturnValue({
      ...ok({ items: [{ title: "Release notes" }], nextSeq: null }),
      refetch: refetchItems,
    });
    h.run.mockReturnValue(ok({ ...base, status: "running", stopReason: null }));
    const { rerender } = renderRun();
    rerender(runTree());
    expect(refetchItems).not.toHaveBeenCalled();

    h.run.mockReturnValue(
      ok({ ...base, status: "succeeded", stopReason: "complete" }),
    );
    rerender(runTree());
    expect(refetchItems).toHaveBeenCalledTimes(1);

    rerender(runTree());
    expect(refetchItems).toHaveBeenCalledTimes(1);
  });

  it("does not refetch the rows for a run that had already ended when opened", () => {
    const refetchItems = vi.fn();
    h.items.mockReturnValue({
      ...ok({ items: [{ title: "Release notes" }], nextSeq: null }),
      refetch: refetchItems,
    });
    h.run.mockReturnValue(
      ok({ ...base, status: "succeeded", stopReason: "complete" }),
    );
    const { rerender } = renderRun();
    rerender(runTree());
    expect(refetchItems).not.toHaveBeenCalled();
  });

  it("shows a page-list run's member-chosen columns and its page address", () => {
    h.overview.mockReturnValue(
      ok({
        collectors: [{ id: "page-list", title: "List on a web page" }],
        recentRuns: [],
        usage: { runsToday: 0, runsPerDay: 20 },
        needsAcknowledgement: false,
      }),
    );
    h.run.mockReturnValue(
      ok({
        ...base,
        collectorId: "page-list",
        input: {
          url: "https://jobs.example.com/careers",
          itemSelector: "li.job",
          fields: [
            { name: "title", selector: "h3 a" },
            { name: "link", selector: "h3 a", attribute: "href" },
            { name: "location", selector: ".where" },
          ],
          maxPages: 5,
        },
        status: "succeeded",
        stopReason: "complete",
        itemCount: 2,
      }),
    );
    h.items.mockReturnValue(
      ok({
        items: [
          {
            title: "Frontend engineer",
            link: "https://jobs.example.com/jobs/frontend",
            location: null,
          },
          {
            title: "Designer",
            link: "https://jobs.example.com/jobs/designer",
            location: "Utrecht",
          },
        ],
        nextSeq: null,
      }),
    );
    renderRun();

    expect(
      screen.getAllByRole("columnheader").map((th) => th.textContent),
    ).toEqual(["title", "link", "location"]);
    const [, first, second] = screen.getAllByRole("row");
    expect(
      [...first!.querySelectorAll("td")].map((td) => td.textContent),
    ).toEqual([
      "Frontend engineer",
      "https://jobs.example.com/jobs/frontend",
      "—",
    ]);
    expect(
      [...second!.querySelectorAll("td")].map((td) => td.textContent),
    ).toEqual([
      "Designer",
      "https://jobs.example.com/jobs/designer",
      "Utrecht",
    ]);
    expect(screen.getByText("jobs.example.com/careers")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "List on a web page" }),
    ).toBeInTheDocument();
  });

  it("pages forward by the next seq and back to the first rows", () => {
    h.run.mockReturnValue(
      ok({
        ...base,
        status: "succeeded",
        stopReason: "complete",
        itemCount: 120,
      }),
    );
    h.items.mockReturnValue(
      ok({ items: [{ title: "Release notes" }], nextSeq: 49 }),
    );
    renderRun();
    expect(lastAfterSeq()).toBe(-1);

    fireEvent.click(
      screen.getByRole("button", { name: en.collectors.run.nextRows }),
    );
    expect(lastAfterSeq()).toBe(49);
    expect(screen.getByText("Showing 51–51 of 120")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: en.collectors.run.firstRows }),
    );
    expect(lastAfterSeq()).toBe(-1);
    expect(
      screen.queryByRole("button", { name: en.collectors.run.firstRows }),
    ).toBeNull();
  });

  it("explains why a page run found no rows", () => {
    h.overview.mockReturnValue(
      ok({
        collectors: [
          { id: "page-list", title: "List on a web page", kind: "page" },
        ],
        recentRuns: [],
        usage: { runsToday: 0, runsPerDay: 20 },
        needsAcknowledgement: false,
      }),
    );
    h.run.mockReturnValue(
      ok({
        ...base,
        collectorId: "page-list",
        status: "succeeded",
        stopReason: "complete",
        itemCount: 0,
      }),
    );
    renderRun();
    expect(screen.getByText(en.collectors.run.noRows)).toBeInTheDocument();
    expect(
      screen.getByText(en.collectors.run.noRowsHint.page),
    ).toBeInTheDocument();
  });

  it("keeps the plain empty note for a feed run", () => {
    h.overview.mockReturnValue(
      ok({
        collectors: [{ id: "feed-items", title: "Feed items", kind: "feed" }],
        recentRuns: [],
        usage: { runsToday: 0, runsPerDay: 20 },
        needsAcknowledgement: false,
      }),
    );
    h.run.mockReturnValue(
      ok({
        ...base,
        status: "succeeded",
        stopReason: "complete",
        itemCount: 0,
      }),
    );
    renderRun();
    expect(screen.getByText(en.collectors.run.noRows)).toBeInTheDocument();
    expect(
      screen.queryByText(en.collectors.run.noRowsHint.page),
    ).not.toBeInTheDocument();
  });
});
