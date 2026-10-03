import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { CollectorSummary } from "@/server/collectors/runs";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({
  overview: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  options: {} as {
    onSuccess?: (r: unknown) => void;
    onError?: (e: unknown) => void;
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    collectors: {
      overview: { useQuery: h.overview },
      start: {
        useMutation: (opts: typeof h.options) => {
          h.options = opts;
          return { mutate: h.mutate, isPending: false };
        },
      },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
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

import { StartRunForm } from "./start-run-form";

const feed: CollectorSummary = {
  id: "feed-items",
  kind: "feed",
  title: "Feed items",
  description: "The latest items of an RSS or Atom feed.",
  fields: [
    {
      name: "url",
      label: "Feed address",
      help: "The web address of the feed.",
      placeholder: "https://example.com/feed.xml",
    },
  ],
  inputJsonSchema: z.toJSONSchema(z.object({ url: z.url() })),
  sampleItem: {},
  limits: { maxPages: 1, maxItems: 1000, maxDurationMs: 60000 },
};

function overview(
  needsAcknowledgement: boolean,
  collectors: CollectorSummary[] = [feed],
) {
  const refetch = vi.fn();
  h.overview.mockReturnValue({
    data: {
      collectors,
      recentRuns: [],
      usage: { runsToday: 0, runsPerDay: 20 },
      needsAcknowledgement,
    },
    isPending: false,
    isError: false,
    refetch,
  });
  return { refetch };
}

function renderForm(collectorId = "feed-items") {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-10-03T12:00:00Z")}
      timeZone="UTC"
    >
      <StartRunForm collectorId={collectorId} />
    </NextIntlClientProvider>,
  );
}

const startButton = () =>
  screen.getByRole("button", { name: en.collectors.start.submit });

beforeEach(() => {
  vi.clearAllMocks();
  h.options = {};
});

describe("StartRunForm", () => {
  it("draws the collector's field from its schema and sends the typed input", () => {
    overview(false);
    renderForm();
    const field = screen.getByLabelText("Feed address");
    expect(field).toHaveAttribute("type", "url");
    fireEvent.change(field, {
      target: { value: " https://blog.example.org/feed.xml " },
    });
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith({
      collectorId: "feed-items",
      input: { url: "https://blog.example.org/feed.xml" },
      acknowledged: false,
    });
  });

  it("holds Start until a first-time member acknowledges the note", () => {
    overview(true);
    renderForm();
    expect(
      screen.getByText(en.collectors.start.firstUseTitle),
    ).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", { name: en.collectors.start.acknowledge }),
    );
    expect(startButton()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Feed address"), {
      target: { value: "https://e.com/f" },
    });
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ acknowledged: true }),
    );
  });

  it("goes to the run page when the run starts", () => {
    overview(false);
    renderForm();
    h.options.onSuccess?.({ ok: true, runId: "run-9" });
    expect(h.push).toHaveBeenCalledWith("/dashboard/collectors/runs/run-9");
  });

  it("marks the field the server rejected", () => {
    overview(false);
    renderForm();
    h.options.onSuccess?.({
      ok: false,
      reason: "invalid_input",
      message: "x",
      fieldErrors: { url: ["Invalid URL"] },
    });
    return screen.findByText(en.collectors.start.invalidUrl).then((note) => {
      expect(screen.getByLabelText("Feed address")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(screen.getByLabelText("Feed address")).toHaveAttribute(
        "aria-describedby",
        expect.stringContaining(note.id),
      );
    });
  });

  it("keeps the general note for a rejected field that is not an address", async () => {
    overview(false, [
      {
        ...feed,
        fields: [
          { name: "topic", label: "Topic", help: null, placeholder: null },
        ],
        inputJsonSchema: z.toJSONSchema(z.object({ topic: z.string() })),
      },
    ]);
    renderForm();
    h.options.onSuccess?.({
      ok: false,
      reason: "invalid_input",
      message: "x",
      fieldErrors: { topic: ["Too short"] },
    });
    expect(
      await screen.findByText(en.collectors.start.invalidField),
    ).toBeInTheDocument();
    expect(screen.queryByText(en.collectors.start.invalidUrl)).toBeNull();
  });

  it("says which limit refused the start and when to try again, keeping the input", async () => {
    overview(false);
    renderForm();
    fireEvent.change(screen.getByLabelText("Feed address"), {
      target: { value: "https://e.com/f" },
    });
    h.options.onSuccess?.({
      ok: false,
      reason: "quota",
      quotaReason: "daily_limit",
      message: "x",
      retryAt: "2026-10-03T15:00:00.000Z",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You've used all 20 runs for the last 24 hours. You can start again in 3 hours.",
    );
    expect(screen.getByLabelText("Feed address")).toHaveValue(
      "https://e.com/f",
    );
  });

  it.each([
    ["active_limit", en.collectors.start.quota.active_limit],
    ["platform_busy", en.collectors.start.quota.platform_busy],
  ])("explains the %s refusal", async (quotaReason, text) => {
    overview(false);
    renderForm();
    h.options.onSuccess?.({
      ok: false,
      reason: "quota",
      quotaReason,
      message: "x",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(text);
  });

  it("says the start failed when the request itself fails", async () => {
    const { refetch } = overview(false);
    renderForm();
    h.options.onError?.({ message: "Network error" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.collectors.start.failed,
    );
    expect(refetch).not.toHaveBeenCalled();
  });

  it("reloads the overview when the server asks for the first-use acknowledgement", async () => {
    const { refetch } = overview(false);
    renderForm();
    h.options.onError?.({ message: "ACKNOWLEDGEMENT_REQUIRED" });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      en.collectors.start.failed,
    );
  });

  it("shows a way back when the collector does not exist", () => {
    overview(false, []);
    renderForm("nope");
    expect(screen.getByText(en.collectors.start.notFound)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.collectors.start.backToList }),
    ).toHaveAttribute("href", "/dashboard/collectors");
  });

  it("shows an error instead of a broken form for a field it cannot draw", () => {
    overview(false, [
      {
        ...feed,
        fields: [
          { name: "fields", label: "Fields", help: null, placeholder: null },
        ],
        inputJsonSchema: z.toJSONSchema(
          z.object({ fields: z.array(z.string()) }),
        ),
      },
    ]);
    renderForm();
    expect(
      screen.getByText(en.collectors.start.unsupported),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: en.collectors.start.submit }),
    ).toBeNull();
  });
});
