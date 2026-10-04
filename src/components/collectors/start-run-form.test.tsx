import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { inputProblemsOf } from "@/lib/collectors/input-problems";
import { getCollector } from "@/server/collectors/catalog";
import type { CollectorSummary, PresetSummary } from "@/server/collectors/runs";

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
      columns: null,
    },
  ],
  inputJsonSchema: z.toJSONSchema(z.object({ url: z.url() })),
  sampleItem: {},
  limits: { maxPages: 1, maxItems: 1000, maxDurationMs: 60000 },
};

const plain = (name: string, label: string) => ({
  name,
  label,
  help: null,
  placeholder: null,
  columns: null,
});

/** The page-list collector, with its real input schema. */
const pageList: CollectorSummary = {
  ...feed,
  id: "page-list",
  kind: "page",
  title: "List on a web page",
  fields: [
    plain("url", "Page address"),
    plain("itemSelector", "Item selector"),
    {
      ...plain("fields", "Columns"),
      columns: [
        { name: "name", label: "Column name", help: null, placeholder: null },
        { name: "selector", label: "Selector", help: null, placeholder: null },
        {
          name: "attribute",
          label: "Attribute",
          help: null,
          placeholder: null,
        },
      ],
    },
    plain("nextPageSelector", "Next-page link"),
    plain("maxPages", "Pages to read"),
  ],
  inputJsonSchema: z.toJSONSchema(getCollector("page-list")!.inputSchema),
};

const feedPreset: PresetSummary = {
  id: "feed",
  group: "research",
  title: "News or blog feed",
  summary: "The latest items of a feed.",
  collectorId: "feed-items",
  base: {},
  ask: ["url"],
  fields: feed.fields,
};
const customPagePreset: PresetSummary = {
  id: "custom-page",
  group: "custom",
  title: "Custom page",
  summary: "Any list on a web page.",
  collectorId: "page-list",
  base: {},
  ask: ["url", "itemSelector", "fields", "nextPageSelector", "maxPages"],
  fields: pageList.fields,
};
/** Asks only the address; its saved selectors sit behind "Show settings". */
const savedPage: PresetSummary = {
  ...customPagePreset,
  id: "saved-page",
  group: "research",
  title: "Saved page",
  summary: "A page we know.",
  ask: ["url"],
  base: {
    itemSelector: "li.job",
    fields: [{ name: "title", selector: "h3" }],
    maxPages: 2,
  },
};

function overview(
  needsAcknowledgement: boolean,
  collectors: CollectorSummary[] = [feed, pageList],
  presets: PresetSummary[] = [feedPreset, customPagePreset, savedPage],
) {
  const refetch = vi.fn();
  h.overview.mockReturnValue({
    data: {
      collectors,
      presets,
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

function form(
  presetId: string,
  prefill: Record<string, string> = {},
  recognised = false,
) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-10-03T12:00:00Z")}
      timeZone="UTC"
    >
      <StartRunForm
        presetId={presetId}
        prefill={prefill}
        recognised={recognised}
      />
    </NextIntlClientProvider>
  );
}

function renderForm(
  presetId = "feed",
  prefill: Record<string, string> = {},
  recognised = false,
) {
  return render(form(presetId, prefill, recognised));
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
      presetId: "feed",
      input: { url: "https://blog.example.org/feed.xml" },
      acknowledged: false,
    });
  });

  it("sends the columns of a filled page-list form as a list of objects", () => {
    overview(false);
    renderForm("custom-page");
    fireEvent.change(screen.getByLabelText("Page address"), {
      target: { value: "https://example.com/jobs" },
    });
    fireEvent.change(screen.getByLabelText("Item selector"), {
      target: { value: "li.job" },
    });
    const columns = screen.getByRole("group", { name: "Columns" });
    fireEvent.change(within(columns).getByLabelText("Column name"), {
      target: { value: " title " },
    });
    fireEvent.change(within(columns).getByLabelText("Selector"), {
      target: { value: "h3 a" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: en.collectors.start.addRow }),
    );
    const second = screen.getByRole("group", { name: "Column 2" });
    fireEvent.change(within(second).getByLabelText("Column name"), {
      target: { value: "link" },
    });
    fireEvent.change(within(second).getByLabelText("Selector"), {
      target: { value: "h3 a" },
    });
    fireEvent.change(within(second).getByLabelText("Attribute"), {
      target: { value: "href" },
    });
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate).toHaveBeenCalledWith({
      presetId: "custom-page",
      input: {
        url: "https://example.com/jobs",
        itemSelector: "li.job",
        fields: [
          { name: "title", selector: "h3 a" },
          { name: "link", selector: "h3 a", attribute: "href" },
        ],
      },
      acknowledged: false,
    });
  });

  it("marks the whole list of columns for a problem with no precise column", async () => {
    overview(false);
    renderForm("custom-page");
    h.options.onSuccess?.({
      ok: false,
      reason: "invalid_input",
      message: "x",
      fieldErrors: { fields: ["too_small"] },
    });
    const note = await screen.findByText(en.collectors.start.invalidField);
    expect(screen.getByRole("group", { name: "Columns" })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(note.id),
    );
  });

  /** Fills the page-list form's columns, one row per entry. */
  function fillColumns(rows: Record<string, string>[]) {
    for (let i = 1; i < rows.length; i += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: en.collectors.start.addRow }),
      );
    }
    rows.forEach((cells, i) => {
      const row = screen.getByRole("group", { name: `Column ${i + 1}` });
      for (const [label, value] of Object.entries(cells)) {
        fireEvent.change(within(row).getByLabelText(label), {
          target: { value },
        });
      }
    });
  }

  const columnInput = (n: number, label: string) =>
    within(screen.getByRole("group", { name: `Column ${n}` })).getByLabelText(
      label,
    );

  function expectProblemAt(input: HTMLElement, text: string) {
    const note = screen.getByText(text);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(note.id),
    );
  }

  it("shows why a column selector was refused at that column's selector", async () => {
    overview(false);
    renderForm("custom-page");
    fillColumns([
      { "Column name": "title", Selector: "h3" },
      { "Column name": "link", Selector: "a:has(b)" },
    ]);
    fireEvent.click(startButton());
    h.options.onSuccess?.({
      ok: false,
      reason: "invalid_input",
      message: "x",
      fieldErrors: {
        "fields.1.selector": ["selector_not_allowed/not_allowed"],
      },
    });
    await screen.findByText(en.collectors.start.problem.selector.not_allowed);
    expectProblemAt(
      columnInput(2, "Selector"),
      en.collectors.start.problem.selector.not_allowed,
    );
    expect(columnInput(1, "Selector")).not.toHaveAttribute("aria-invalid");
    expect(columnInput(2, "Column name")).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText(en.collectors.start.invalidField)).toBeNull();
  });

  it("counts only the columns it sent when placing a problem", async () => {
    overview(false);
    renderForm("custom-page");
    fillColumns([
      { "Column name": "title", Selector: "h3" },
      {},
      { "Column name": "title", Selector: "a" },
    ]);
    fireEvent.click(startButton());
    h.options.onSuccess?.({
      ok: false,
      reason: "invalid_input",
      message: "x",
      fieldErrors: { "fields.1.name": ["duplicate_name"] },
    });
    await screen.findByText(en.collectors.start.problem.duplicate_name);
    expectProblemAt(
      columnInput(3, "Column name"),
      en.collectors.start.problem.duplicate_name,
    );
    expect(columnInput(2, "Column name")).not.toHaveAttribute("aria-invalid");
  });

  it("names the problem at the item and next-page selectors", async () => {
    overview(false);
    renderForm("custom-page");
    h.options.onSuccess?.({
      ok: false,
      reason: "invalid_input",
      message: "x",
      fieldErrors: {
        itemSelector: ["selector_not_allowed/too_long"],
        nextPageSelector: ["selector_not_allowed/list"],
      },
    });
    const tooLong = "This selector is too long. Use at most 200 characters.";
    await screen.findByText(tooLong);
    expectProblemAt(screen.getByLabelText("Item selector"), tooLong);
    expectProblemAt(
      screen.getByLabelText("Next-page link"),
      en.collectors.start.problem.selector.list,
    );
  });

  it("keeps the first column's inputs in place while other fields change", () => {
    overview(false);
    renderForm("custom-page");
    const name = columnInput(1, "Column name");
    fireEvent.change(screen.getByLabelText("Page address"), {
      target: { value: "https://example.com/jobs" },
    });
    expect(columnInput(1, "Column name")).toBe(name);
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
      fieldErrors: { url: ["invalid_format"] },
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
    overview(false);
    renderForm("custom-page");
    h.options.onSuccess?.({
      ok: false,
      reason: "invalid_input",
      message: "x",
      fieldErrors: { itemSelector: ["too_small"] },
    });
    const note = await screen.findByText(en.collectors.start.invalidField);
    expectProblemAt(
      screen.getByLabelText("Item selector"),
      en.collectors.start.invalidField,
    );
    expect(note).toBeInTheDocument();
    expect(screen.queryByText(en.collectors.start.invalidUrl)).toBeNull();
  });

  it("keeps a pasted http:// address as typed and asks for https:// at that field", async () => {
    overview(false);
    renderForm("feed", { url: "http://example.com/feed.xml" }, true);
    const field = screen.getByRole("textbox", { name: "Feed address" });
    expect(field).toHaveValue("http://example.com/feed.xml");
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith({
      presetId: "feed",
      input: { url: "http://example.com/feed.xml" },
      acknowledged: false,
    });
    // What the real feed collector says about this address.
    const parsed = getCollector("feed-items")!.inputSchema.safeParse({
      url: "http://example.com/feed.xml",
    });
    expect(parsed.success).toBe(false);
    act(() =>
      h.options.onSuccess!({
        ok: false,
        reason: "invalid_input",
        message: "x",
        fieldErrors: inputProblemsOf(parsed.error!.issues),
      }),
    );
    expectProblemAt(field, en.collectors.start.invalidUrl);
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
    overview(false);
    renderForm("nope");
    expect(screen.getByText(en.collectors.start.notFound)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.collectors.start.backToList }),
    ).toHaveAttribute("href", "/dashboard/collectors");
  });

  it("shows an error instead of a broken form for a field it cannot draw", () => {
    const odd: CollectorSummary = {
      ...feed,
      id: "odd-collector",
      fields: [
        {
          name: "fields",
          label: "Fields",
          help: null,
          placeholder: null,
          columns: null,
        },
      ],
      inputJsonSchema: z.toJSONSchema(
        z.object({ fields: z.array(z.string()) }),
      ),
    };
    overview(
      false,
      [odd],
      [{ ...feedPreset, id: "odd", collectorId: odd.id, fields: odd.fields }],
    );
    renderForm("odd");
    expect(
      screen.getByText(en.collectors.start.unsupported),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: en.collectors.start.submit }),
    ).toBeNull();
  });
  it("shows the preset's title as the one heading, with its summary and no breadcrumb or kicker", () => {
    overview(false);
    renderForm("feed");
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "News or blog feed",
    ]);
    expect(screen.getByText("The latest items of a feed.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });

  it("asks only the preset's fields up front and keeps the rest, pre-filled, behind Show settings", () => {
    overview(false);
    renderForm("saved-page");
    expect(
      screen.getByRole("textbox", { name: "Page address" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Item selector" })).toBeNull();
    const toggle = screen.getByRole("button", {
      name: en.collectors.start.showSettings,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: en.collectors.start.hideSettings }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Item selector" })).toHaveValue(
      "li.job",
    );
    expect(
      screen.getByRole("spinbutton", { name: "Pages to read" }),
    ).toHaveValue(2);
  });

  it("has no Show settings when the preset asks for everything", () => {
    overview(false);
    renderForm("custom-page");
    expect(
      screen.queryByRole("button", { name: en.collectors.start.showSettings }),
    ).toBeNull();
  });

  it("sends the preset's settings with the member's answers while the settings stay closed", () => {
    overview(false);
    renderForm("saved-page");
    fireEvent.change(screen.getByRole("textbox", { name: "Page address" }), {
      target: { value: "https://jobs.example.com/" },
    });
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith({
      presetId: "saved-page",
      input: {
        url: "https://jobs.example.com/",
        itemSelector: "li.job",
        fields: [{ name: "title", selector: "h3" }],
        maxPages: 2,
      },
      acknowledged: false,
    });
  });

  it("opens the settings when the server refuses a value hidden there", () => {
    overview(false);
    renderForm("saved-page");
    fireEvent.click(startButton());
    act(() =>
      h.options.onSuccess!({
        ok: false,
        reason: "invalid_input",
        message: "x",
        fieldErrors: { itemSelector: ["selector_not_allowed/not_allowed"] },
      }),
    );
    expect(
      screen.getByRole("button", { name: en.collectors.start.hideSettings }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText(en.collectors.start.problem.selector.not_allowed),
    ).toBeVisible();
  });

  it("fills the fields from a pasted link and says what it recognised", () => {
    overview(false);
    renderForm(
      "feed",
      { url: "https://example.com/feed.xml", bogus: "x" },
      true,
    );
    expect(screen.getByRole("textbox", { name: "Feed address" })).toHaveValue(
      "https://example.com/feed.xml",
    );
    expect(
      screen.getByText(
        "Recognised as News or blog feed (example.com/feed.xml).",
        { exact: false },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: en.collectors.start.pickAnother }),
    ).toHaveAttribute("href", "/dashboard/collectors");
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith({
      presetId: "feed",
      input: { url: "https://example.com/feed.xml" },
      acknowledged: false,
    });
  });

  it("says nothing about recognising for a plain start", () => {
    overview(false);
    renderForm("custom-page", { url: "https://example.com/jobs" });
    expect(screen.queryByText(/Recognised as/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Page address" })).toHaveValue(
      "https://example.com/jobs",
    );
  });

  it("starts afresh when the member moves to another preset", () => {
    overview(false);
    const { rerender } = renderForm("feed");
    fireEvent.change(screen.getByRole("textbox", { name: "Feed address" }), {
      target: { value: "https://typed.example/feed" },
    });
    rerender(form("custom-page"));
    expect(screen.getByRole("textbox", { name: "Page address" })).toHaveValue(
      "",
    );
  });
});
