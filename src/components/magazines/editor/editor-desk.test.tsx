import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "../test-intl";

type CreateOptions = {
  onSuccess?: (data: { id: number }) => void;
  onError?: (error: unknown) => void;
};

const trpc = vi.hoisted(() => ({
  createCalls: [] as Record<string, unknown>[],
  createOutcome: { id: 42 } as { id: number } | { message: string },
  push: vi.fn(),
}));

const query = (data: unknown) => ({
  data,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
});

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: trpc.push }),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    magazines: {
      listIssues: {
        useQuery: () =>
          query([
            {
              id: 9,
              number: 4,
              title: "The tools issue",
              slug: "issue-4",
              status: "draft",
              visibility: "members",
              publishedAt: null,
              coverImageUrl: null,
              updatedAt: "2026-10-20T00:00:00.000Z",
            },
            {
              id: 8,
              number: 3,
              title: "Agents at work",
              slug: "issue-3",
              status: "published",
              visibility: "public",
              publishedAt: "2026-10-01T00:00:00.000Z",
              coverImageUrl: null,
              updatedAt: "2026-10-01T00:00:00.000Z",
            },
          ]),
      },
      availableArticles: {
        useQuery: () =>
          query([
            {
              id: 5,
              slug: "why-evals-matter",
              title: "Why evals matter",
              authorName: "Ada",
              updatedAt: "2026-10-18T00:00:00.000Z",
              editableByViewer: true,
            },
            {
              id: 7,
              slug: "someone-elses",
              title: "Someone else's story",
              authorName: "Grace",
              updatedAt: "2026-10-17T00:00:00.000Z",
              editableByViewer: false,
            },
          ]),
      },
      myDraftArticles: {
        useQuery: () =>
          query([
            {
              id: 6,
              slug: "half-done",
              title: "Half done",
              reviewStatus: "changes_requested",
              updatedAt: "2026-10-19T00:00:00.000Z",
            },
          ]),
      },
      createIssue: {
        useMutation: (opts: CreateOptions) => ({
          isPending: false,
          mutate: (input: Record<string, unknown>) => {
            trpc.createCalls.push(input);
            const outcome = trpc.createOutcome;
            if ("id" in outcome) opts.onSuccess?.(outcome);
            else opts.onError?.({ message: outcome.message, data: null });
          },
        }),
      },
    },
  },
}));

import { EditorDesk } from "./editor-desk";

beforeEach(() => {
  trpc.createCalls = [];
  trpc.createOutcome = { id: 42 };
  trpc.push.mockReset();
});

describe("EditorDesk", () => {
  it("creates the next issue and opens it in the builder", () => {
    renderWithIntl(<EditorDesk slug="amsterdam-ai" />);
    fireEvent.click(screen.getByRole("button", { name: "New issue" }));
    expect(trpc.createCalls).toEqual([
      { slug: "amsterdam-ai", title: "Issue 5" },
    ]);
    expect(trpc.push).toHaveBeenCalledWith(
      "/communities/amsterdam-ai/magazine/issues/42/edit",
    );
  });

  it("shows a friendly message when the issue cannot be created", () => {
    trpc.createOutcome = { message: "SOMETHING_RAW" };
    renderWithIntl(<EditorDesk slug="amsterdam-ai" />);
    fireEvent.click(screen.getByRole("button", { name: "New issue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
    expect(trpc.push).not.toHaveBeenCalled();
  });

  it("lists issues with their status, ready articles and the editor's drafts", () => {
    renderWithIntl(<EditorDesk slug="amsterdam-ai" />);

    const issues = screen.getByRole("region", { name: /Issues/ });
    const draft = within(issues).getByRole("link", { name: /The tools issue/ });
    expect(draft).toHaveAttribute(
      "href",
      "/communities/amsterdam-ai/magazine/issues/9/edit",
    );
    expect(within(draft).getByText("Draft")).toBeInTheDocument();
    expect(
      within(issues).getByRole("link", { name: /Agents at work/ }),
    ).toHaveTextContent("Published");

    const ready = screen.getByRole("region", { name: /Ready for an issue/ });
    // The writer can reopen a ready article to fix a typo.
    expect(
      within(ready).getByRole("link", { name: /Why evals matter/ }),
    ).toHaveAttribute(
      "href",
      "/communities/amsterdam-ai/magazine/articles/why-evals-matter/edit",
    );
    expect(within(ready).getByText("By Ada")).toBeInTheDocument();
    // Another author's ready article is listed, but not a link.
    expect(within(ready).getByText("Someone else's story")).toBeInTheDocument();
    expect(
      within(ready).queryByRole("link", { name: /Someone else's story/ }),
    ).toBeNull();

    const drafts = screen.getByRole("region", { name: /Your drafts/ });
    expect(
      within(drafts).getByRole("link", { name: /Half done/ }),
    ).toHaveAttribute(
      "href",
      "/communities/amsterdam-ai/magazine/articles/half-done/edit",
    );
    expect(within(drafts).getByText("Changes requested")).toBeInTheDocument();

    expect(
      screen.getByRole("link", { name: "Write an article" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai/magazine/write");
    expect(
      screen.getByRole("link", { name: "Magazine settings" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai/settings/magazine");
  });
});
