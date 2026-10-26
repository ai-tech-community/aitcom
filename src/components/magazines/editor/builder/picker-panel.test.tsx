import { act, fireEvent, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
};

const trpc = vi.hoisted(() => ({
  candidates: [] as Candidate[],
  queries: [] as { slug: string; kind: string; query: string }[],
}));

vi.mock("@/trpc/react", () => ({
  api: {
    magazines: {
      pickerCandidates: {
        useQuery: (input: { slug: string; kind: string; query: string }) => {
          trpc.queries.push(input);
          return {
            data: trpc.candidates,
            isLoading: false,
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
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PickerPanel", () => {
  it("searches the kind with the typed words after a pause", async () => {
    renderPanel();
    expect(trpc.queries.at(-1)).toEqual({
      slug: "night-owls",
      kind: "article",
      query: "",
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

  it("says nothing matches a search", async () => {
    renderPanel();
    fireEvent.change(
      screen.getByRole("textbox", { name: "Search ready articles" }),
      { target: { value: "eval" } },
    );
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByText("Nothing matches “eval”.")).toBeInTheDocument();
  });
});
