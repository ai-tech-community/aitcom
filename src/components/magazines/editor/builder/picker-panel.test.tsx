import { act, fireEvent, screen, within } from "@testing-library/react";
import { keepPreviousData } from "@tanstack/react-query";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SuggestionReason } from "@/lib/magazines/suggestions";

import { renderWithIntl } from "../../test-intl";

type ArticleInput = { kind: "article"; articleId: number };

type Candidate = {
  input: ArticleInput;
  reference: string;
  title: string;
  facts: (
    | { type: "byline"; name: string }
    | { type: "source"; host: string }
    | { type: "count"; what: "sources"; value: number }
    | { type: "date"; label: "updated"; at: string }
  )[];
  openHref: string | null;
  reason?: SuggestionReason | null;
};

const trpc = vi.hoisted(() => ({
  candidates: [] as Candidate[],
  queries: [] as {
    slug: string;
    kind: string;
    query: string;
    exclude: string[];
  }[],
  options: [] as { placeholderData: unknown }[],
  loading: false,
  placeholder: false,
  fetching: false,
}));

vi.mock("@/trpc/react", () => ({
  api: {
    magazines: {
      pickerCandidates: {
        useQuery: (
          input: {
            slug: string;
            kind: string;
            query: string;
            exclude: string[];
          },
          options: { placeholderData: unknown },
        ) => {
          trpc.options.push(options);
          trpc.queries.push(input);
          return {
            data: trpc.candidates,
            isLoading: trpc.loading,
            isPlaceholderData: trpc.placeholder,
            isFetching: trpc.fetching,
            isError: false,
            refetch: vi.fn(),
          };
        },
      },
    },
  },
}));

import { PickerPanel } from "./picker-panel";

function renderPanel(props: Partial<ComponentProps<typeof PickerPanel>> = {}) {
  return renderWithIntl(
    <PickerPanel
      kind="article"
      communitySlug="night-owls"
      referencesInIssue={new Set()}
      onAdd={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  trpc.candidates = [];
  trpc.queries = [];
  trpc.options = [];
  trpc.loading = false;
  trpc.placeholder = false;
  trpc.fetching = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PickerPanel", () => {
  it("shows why a suggestion is offered", async () => {
    trpc.candidates = [
      {
        input: { kind: "article", articleId: 4 },
        reference: "article:4",
        title: "Evals",
        facts: [{ type: "byline", name: "Ada" }],
        openHref: null,
        reason: { type: "waitingSince", at: "2026-10-24T10:00:00.000Z" },
      },
    ];
    renderPanel();
    expect(
      screen.getByRole("heading", { name: "Suggested for this issue" }),
    ).toBeVisible();
    expect(screen.getByText(/Approved and waiting since/)).toHaveTextContent(
      "Approved and waiting since 24 Oct 2026",
    );
    expect(screen.getByText(/Approved and waiting since/)).toHaveClass(
      "text-muted-foreground",
      "text-xs",
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "eval" },
    });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(
      screen.queryByRole("heading", { name: "Suggested for this issue" }),
    ).toBeNull();
  });

  it("keeps the usual list when the first result has no reason", () => {
    trpc.candidates = [
      {
        input: { kind: "article", articleId: 4 },
        reference: "article:4",
        title: "Evals",
        facts: [],
        openHref: null,
        reason: null,
      },
    ];
    renderPanel();
    expect(
      screen.queryByRole("heading", { name: "Suggested for this issue" }),
    ).toBeNull();
    expect(screen.getByText("Evals")).toBeVisible();
  });

  it("searches the kind with the typed words after a pause", async () => {
    renderPanel();
    expect(trpc.queries.at(-1)).toEqual({
      slug: "night-owls",
      kind: "article",
      query: "",
      exclude: [],
    });

    fireEvent.change(
      screen.getByRole("textbox", { name: "Search ready articles" }),
      {
        target: { value: "eval" },
      },
    );
    expect(trpc.queries.some((query) => query.query === "eval")).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(249));
    expect(trpc.queries.some((query) => query.query === "eval")).toBe(false);

    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(trpc.queries.at(-1)).toEqual({
      slug: "night-owls",
      kind: "article",
      query: "eval",
      exclude: [],
    });
  });

  it("shows each candidate's facts in plain words", () => {
    trpc.candidates = [
      {
        input: { kind: "article", articleId: 4 },
        reference: "article:4",
        title: "Evals",
        facts: [
          { type: "byline", name: "Ada" },
          { type: "source", host: "example.com" },
          { type: "count", what: "sources", value: 14 },
          { type: "date", label: "updated", at: "2026-10-24T10:00:00.000Z" },
        ],
        openHref: null,
      },
    ];
    renderPanel();

    const facts = screen.getByText("By Ada").parentElement!;
    expect(within(facts).getAllByText("·")).toHaveLength(3);
    expect(within(facts).getAllByText(",")).toHaveLength(3);
    expect(screen.getByText("By Ada")).not.toHaveClass("font-mono");
    expect(screen.getByText("example.com")).not.toHaveClass("font-mono");
    expect(screen.getByText("14 sources")).toHaveClass("font-mono");
    expect(screen.getByText("Updated 24 Oct 2026")).toHaveClass("font-mono");
    expect(
      screen.getByText(
        "Only articles marked ready and not in another issue show here.",
      ),
    ).toBeInTheDocument();
  });

  it("leaves out what the issue already holds and moves focus after Add", () => {
    const kept: Candidate = {
      input: { kind: "article", articleId: 1 },
      reference: "ref-kept",
      title: "Kept",
      facts: [],
      openHref: "/edit/kept",
    };
    const held: Candidate = {
      input: { kind: "article", articleId: 2 },
      reference: "ref-held",
      title: "Already in",
      facts: [],
      openHref: null,
    };
    const next: Candidate = {
      input: { kind: "article", articleId: 3 },
      reference: "ref-next",
      title: "Next",
      facts: [],
      openHref: null,
    };
    trpc.candidates = [kept, held, next];
    const calls: {
      input: ArticleInput;
      added: { title: string | null; openHref: string | null };
    }[] = [];
    const referenceOf = new Map(
      trpc.candidates.map((candidate) => [
        candidate.input.articleId,
        candidate.reference,
      ]),
    );

    function Host() {
      const [refs, setRefs] = useState(() => new Set(["ref-held"]));
      return (
        <PickerPanel
          kind="article"
          communitySlug="night-owls"
          referencesInIssue={refs}
          onAdd={(input, added) => {
            if (input.kind !== "article") return;
            calls.push({ input, added });
            const reference = referenceOf.get(input.articleId);
            if (reference) {
              setRefs((current) => new Set(current).add(reference));
            }
          }}
        />
      );
    }

    renderWithIntl(<Host />);
    expect(trpc.queries.at(-1)?.exclude).toEqual(["ref-held"]);
    expect(screen.queryByText("Already in")).toBeNull();
    expect(screen.getByText("Kept")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Add Kept to the issue" }),
    );
    expect(calls).toEqual([
      {
        input: { kind: "article", articleId: 1 },
        added: { title: "Kept", openHref: "/edit/kept" },
      },
    ]);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Add Next to the issue" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Add Next to the issue" }),
    );
    expect(document.activeElement).toHaveTextContent(
      "No articles are ready. Articles marked ready for an issue show up here.",
    );
  });

  it.each(["wait", "move", "type"])(
    "keeps focus through a server refill without overriding a later move (%s)",
    (action) => {
      trpc.candidates = [
        {
          input: { kind: "article", articleId: 1 },
          reference: "article:1",
          title: "Newest",
          facts: [],
          openHref: null,
        },
      ];
      let refresh: () => void = vi.fn();
      function Host() {
        const [, setRender] = useState(0);
        refresh = () => setRender((value) => value + 1);
        const [refs, setRefs] = useState(new Set<string>());
        return (
          <>
            <button type="button">Elsewhere</button>
            <PickerPanel
              kind="article"
              communitySlug="night-owls"
              referencesInIssue={refs}
              onAdd={() => {
                trpc.placeholder = true;
                trpc.fetching = true;
                setRefs(new Set(["article:1"]));
              }}
            />
          </>
        );
      }
      renderWithIntl(<Host />);
      fireEvent.click(
        screen.getByRole("button", { name: "Add Newest to the issue" }),
      );
      const elsewhere = screen.getByRole("button", { name: "Elsewhere" });
      const input = screen.getByRole("textbox", {
        name: "Search ready articles",
      });
      if (action === "move") elsewhere.focus();
      if (action === "type")
        fireEvent.change(input, { target: { value: "o" } });
      trpc.candidates = [
        {
          input: { kind: "article", articleId: 2 },
          reference: "article:2",
          title: "Older",
          facts: [],
          openHref: null,
        },
      ];
      trpc.placeholder = false;
      trpc.fetching = false;
      act(() => refresh());
      expect(document.activeElement).toBe(
        action === "move"
          ? elsewhere
          : action === "type"
            ? input
            : screen.getByRole("button", { name: "Add Older to the issue" }),
      );
    },
  );

  it("keeps a polite status mounted through loading and announces completed results", () => {
    trpc.loading = true;
    trpc.fetching = true;
    renderPanel();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");
    trpc.loading = false;
    trpc.fetching = false;
    trpc.candidates = [
      {
        input: { kind: "article", articleId: 4 },
        reference: "article:4",
        title: "Evals",
        facts: [],
        openHref: null,
      },
    ];
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search ready articles" }),
      { target: { value: "e" } },
    );
    expect(screen.getByRole("status")).toBe(status);
    expect(status).toHaveTextContent("1 result");
  });

  it("keeps previous results visible and busy while the next search loads", () => {
    trpc.placeholder = true;
    trpc.fetching = true;
    trpc.loading = true;
    trpc.candidates = [
      {
        input: { kind: "article", articleId: 4 },
        reference: "article:4",
        title: "Evals",
        facts: [],
        openHref: null,
      },
    ];
    renderPanel();
    expect(trpc.options.at(-1)?.placeholderData).toBe(keepPreviousData);
    expect(screen.getByRole("list")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("list")).toHaveClass("opacity-50");
    expect(screen.getByText("Evals")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("says nothing matches a search", async () => {
    renderPanel();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search ready articles" }),
      { target: { value: "eval" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Nothing matches “eval”.",
    );
    expect(screen.getAllByText("Nothing matches “eval”.")).toHaveLength(2);
  });
});
