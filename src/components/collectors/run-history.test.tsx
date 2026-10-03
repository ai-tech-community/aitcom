import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({ runs: vi.fn(), overview: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: {
    collectors: {
      runs: { useQuery: h.runs },
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

import { RunHistory } from "./run-history";

const ok = (data: unknown) => ({
  data,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
});
const run = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  collectorId: "feed-items",
  status: "succeeded",
  stopReason: "complete",
  itemCount: 48,
  input: { url: "https://blog.example.org/feed.xml" },
  createdAt: "2026-10-03T10:00:00.000Z",
  expiresAt: "2026-11-02T10:00:00.000Z",
  ...over,
});

function renderHistory() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-10-03T12:00:00Z")}
      timeZone="UTC"
    >
      <RunHistory />
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
});

describe("RunHistory", () => {
  it("lists runs with status, rows and why they ended", () => {
    h.runs.mockReturnValue(
      ok({
        runs: [
          run("r1"),
          run("r2", {
            status: "failed",
            stopReason: "robots_disallowed",
            itemCount: 0,
          }),
        ],
        nextCursor: null,
      }),
    );
    renderHistory();
    expect(h.runs).toHaveBeenCalledWith({ limit: 20 }, expect.anything());
    expect(
      screen.getAllByRole("link", { name: /Feed items/ })[0],
    ).toHaveAttribute("href", "/dashboard/collectors/runs/r1");
    expect(
      screen.getByText(en.collectors.stopShort.complete),
    ).toBeInTheDocument();
    expect(
      screen.getByText(en.collectors.stopShort.robots_disallowed),
    ).toBeInTheDocument();
    expect(screen.getByText(en.collectors.status.failed)).toBeInTheDocument();
  });

  it("loads older runs with the next cursor", () => {
    h.runs.mockImplementation((input: { cursor?: string }) =>
      ok(
        input.cursor
          ? { runs: [run("r3")], nextCursor: null }
          : { runs: [run("r1")], nextCursor: "c1" },
      ),
    );
    renderHistory();
    fireEvent.click(
      screen.getByRole("button", { name: en.collectors.history.older }),
    );
    expect(h.runs).toHaveBeenCalledWith({ limit: 20, cursor: "c1" });
    expect(screen.getAllByRole("link", { name: /Feed items/ })).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: en.collectors.history.older }),
    ).toBeNull();
  });

  it("keeps earlier runs on screen and offers a retry when an older page fails", () => {
    const refetch = vi.fn();
    h.runs.mockImplementation((input: { cursor?: string }) =>
      input.cursor
        ? { data: undefined, isPending: false, isError: true, refetch }
        : ok({ runs: [run("r1")], nextCursor: "c1" }),
    );
    renderHistory();
    fireEvent.click(
      screen.getByRole("button", { name: en.collectors.history.older }),
    );
    expect(screen.getByRole("link", { name: /Feed items/ })).toHaveAttribute(
      "href",
      "/dashboard/collectors/runs/r1",
    );
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(refetch).toHaveBeenCalled();
  });

  it("teaches the next step when there are no runs", () => {
    h.runs.mockReturnValue(ok({ runs: [], nextCursor: null }));
    renderHistory();
    expect(
      screen.getByText(en.collectors.history.emptyTitle),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.collectors.history.chooseCollector }),
    ).toHaveAttribute("href", "/dashboard/collectors");
  });

  it("polls the newest runs every 5 seconds while one is active", () => {
    h.runs.mockReturnValue(
      ok({ runs: [run("r1", { status: "running" })], nextCursor: null }),
    );
    renderHistory();
    const options = h.runs.mock.calls[0]![1] as {
      refetchInterval: (q: { state: { data: unknown } }) => unknown;
    };
    const page = (status: string) => ({
      state: { data: { runs: [run("r1", { status }), run("r0")] } },
    });
    expect(options.refetchInterval(page("queued"))).toBe(5000);
    expect(options.refetchInterval(page("running"))).toBe(5000);
    expect(options.refetchInterval(page("succeeded"))).toBe(false);
    expect(options.refetchInterval({ state: { data: undefined } })).toBe(false);
  });

  it("starts the older pages again when a new run appears on top", () => {
    let newest = "r1";
    h.runs.mockImplementation((input: { cursor?: string }) =>
      ok(
        input.cursor
          ? { runs: [run("r3")], nextCursor: null }
          : { runs: [run(newest)], nextCursor: `after-${newest}` },
      ),
    );
    const view = renderHistory();
    fireEvent.click(
      screen.getByRole("button", { name: en.collectors.history.older }),
    );
    expect(h.runs).toHaveBeenCalledWith({ limit: 20, cursor: "after-r1" });

    newest = "r0";
    h.runs.mockClear();
    view.rerender(
      <NextIntlClientProvider
        locale="en"
        messages={en}
        now={new Date("2026-10-03T12:00:00Z")}
        timeZone="UTC"
      >
        <RunHistory />
      </NextIntlClientProvider>,
    );
    // The stale older page (cut at the old top) is gone; paging restarts
    // from the new first page's cursor.
    expect(h.runs).not.toHaveBeenCalledWith({
      limit: 20,
      cursor: "after-r1",
    });
    expect(screen.getAllByRole("link", { name: /Feed items/ })).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: en.collectors.history.older }),
    );
    expect(h.runs).toHaveBeenCalledWith({ limit: 20, cursor: "after-r0" });
  });
});
