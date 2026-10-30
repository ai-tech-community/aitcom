import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { localDateTimeToIso } from "@/lib/magazines/schedule";
import type { IssueListRow } from "@/server/magazines/issue-editing";

import { renderWithIntl } from "../test-intl";

type CreateOptions = {
  onSuccess?: (data: { id: number }) => void;
  onError?: (error: unknown) => void;
};

const trpc = vi.hoisted(() => ({
  createCalls: [] as Record<string, unknown>[],
  createOutcome: { id: 42 } as { id: number } | { message: string },
  push: vi.fn(),
  extraIssues: [] as IssueListRow[],
  counts: { withAccount: 3, byEmail: 2, waiting: 1 } as {
    withAccount: number;
    byEmail: number;
    waiting: number;
  } | null,
  countsLoading: false,
  countsError: false,
  countsInput: vi.fn(),
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
    useUtils: () => ({
      magazines: {
        listIssues: { invalidate: vi.fn() },
        availableArticles: { invalidate: vi.fn() },
        myDraftArticles: { invalidate: vi.fn() },
        pickerCandidates: { invalidate: vi.fn() },
      },
    }),
    articles: {
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
    magazines: {
      subscriberCounts: {
        useQuery: (input: unknown) => {
          trpc.countsInput(input);
          return {
            data: trpc.counts,
            isLoading: trpc.countsLoading,
            isError: trpc.countsError,
          };
        },
      },
      listIssues: {
        useQuery: () =>
          query([
            ...trpc.extraIssues,
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
      reviewQueue: {
        useQuery: () =>
          query([
            {
              id: 10,
              slug: "waiting-story",
              title: "Waiting story",
              authorName: "Kim",
              sentAt: "2026-10-21T00:00:00.000Z",
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
      deleteDraftIssue: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
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
  trpc.extraIssues = [];
  trpc.counts = { withAccount: 3, byEmail: 2, waiting: 1 };
  trpc.countsLoading = false;
  trpc.countsError = false;
  trpc.countsInput.mockReset();
});

describe("EditorDesk", () => {
  it("shows Automatic drafts to every editor", () => {
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage={false} />);
    expect(
      screen.getByRole("link", { name: "Automatic drafts" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai/magazine/auto-draft");
  });
  it("a scheduled issue says when it goes out", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      trpc.extraIssues = [
        {
          id: 10,
          number: 5,
          title: "The next issue",
          slug: "issue-5",
          status: "scheduled",
          visibility: "members",
          publishedAt: null,
          coverImageUrl: null,
          updatedAt: "2030-01-01T00:00:00.000Z",
          scheduledFor: localDateTimeToIso("2030-01-02T09:30"),
        },
      ];
      renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);
      const row = within(screen.getByRole("link", { name: /The next issue/ }));
      expect(row.getByText("Scheduled")).toHaveAttribute(
        "data-variant",
        "secondary",
      );
      const time = row.getByText(/^Goes out/);
      expect(time).not.toHaveClass("font-mono");
      expect(time.querySelector("span.font-mono")).toHaveTextContent("9:30 AM");
      expect(time.querySelector("span.font-mono")).not.toHaveTextContent(
        "Goes out",
      );
      expect(time).toHaveTextContent("9:30 AM");
      expect(time).not.toHaveTextContent(/5:30 PM|17:30/);
    } finally {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });

  it("shows how many people subscribe, not counting those still waiting to confirm", () => {
    const { unmount } = renderWithIntl(
      <EditorDesk slug="amsterdam-ai" canManage />,
    );
    expect(trpc.countsInput).toHaveBeenCalledWith({ slug: "amsterdam-ai" });
    const total = screen.getByText(/subscribers$/);
    expect(total).toHaveTextContent("5 subscribers");
    expect(screen.getByText(/with an account/)).toHaveTextContent(
      "3 with an account · 2 by email · 1 waiting to confirm",
    );
    expect(within(total).getByText("5")).toHaveClass("font-mono");
    expect(screen.queryByRole("status")).toBeNull();
    unmount();
    trpc.counts = { withAccount: 0, byEmail: 0, waiting: 0 };
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);
    expect(screen.getByText("No subscribers yet")).toBeVisible();
    expect(
      screen.queryByText(/with an account|by email|waiting to confirm/),
    ).toBeNull();
  });

  it("leaves out subscriber details with zero people", () => {
    trpc.counts = { withAccount: 1, byEmail: 0, waiting: 0 };
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);
    expect(screen.getByText("subscriber")).toHaveTextContent("1 subscriber");
    expect(screen.getByText(/with an account/)).toHaveTextContent(
      "1 with an account",
    );
    expect(screen.queryByText(/by email|waiting to confirm/)).toBeNull();
  });

  it.each(["loading", "error", "missing"])(
    "hides supplementary subscriber counts while %s",
    (state) => {
      trpc.countsLoading = state === "loading";
      trpc.countsError = state === "error";
      if (state === "missing") trpc.counts = null;
      renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText(/subscribers/)).toBeNull();
    },
  );
  it("shows Team only to those who manage the magazine", () => {
    const { unmount } = renderWithIntl(
      <EditorDesk slug="amsterdam-ai" canManage />,
    );
    expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute(
      "href",
      "/communities/amsterdam-ai/magazine/team",
    );
    unmount();
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage={false} />);
    expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
  });
  it("lists articles waiting for review, linking to the review page", () => {
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage={false} />);
    const waiting = screen.getByRole("region", { name: /Waiting for you/ });
    const link = within(waiting).getByRole("link", { name: /Waiting story/ });
    expect(link).toHaveAttribute(
      "href",
      "/communities/amsterdam-ai/magazine/review/waiting-story",
    );
    expect(link).toHaveTextContent("By Kim");
    const stamp = within(link).getByText("Sent Oct 21");
    expect(stamp).toHaveClass("font-mono");
    expect(stamp).toHaveAttribute("datetime", "2026-10-21T00:00:00.000Z");
    const lists = screen.getAllByRole("region").slice(1);
    expect(
      lists.map((list) => within(list).getByRole("heading").textContent),
    ).toEqual([
      "/ Waiting for you",
      "/ Issues",
      "/ Ready for an issue",
      "/ Your drafts",
    ]);
  });

  it("shows Settings only to those who manage the magazine", () => {
    const { unmount } = renderWithIntl(
      <EditorDesk slug="amsterdam-ai" canManage />,
    );
    expect(
      screen.getByRole("link", { name: "Magazine settings" }),
    ).toBeInTheDocument();
    unmount();
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage={false} />);
    expect(
      screen.queryByRole("link", { name: "Magazine settings" }),
    ).toBeNull();
  });

  it("creates the next issue and opens it in the builder", () => {
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);
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
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);
    fireEvent.click(screen.getByRole("button", { name: "New issue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
    expect(trpc.push).not.toHaveBeenCalled();
  });

  it("links each published issue to its numbers", () => {
    trpc.extraIssues = [
      {
        id: 7,
        number: 2,
        title: "Earlier issue",
        slug: "issue-2",
        status: "published",
        visibility: "members",
        publishedAt: "2026-09-01T00:00:00.000Z",
        scheduledFor: null,
        coverImageUrl: null,
        updatedAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);
    const issues = screen.getByRole("region", { name: /Issues/ });
    const links = within(issues).getAllByRole("link", {
      name: /^Numbers for issue/,
    });
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/communities/amsterdam-ai/magazine/issues/7/stats",
      "/communities/amsterdam-ai/magazine/issues/8/stats",
    ]);
    expect(links[0]).toHaveAccessibleName("Numbers for issue 2");
    expect(links[1]).toHaveAccessibleName("Numbers for issue 3");
    for (const link of links) {
      expect(link.closest("li")?.querySelectorAll("a")).toHaveLength(2);
      expect(link.closest("a a")).toBeNull();
    }
    expect(
      within(issues)
        .getByRole("link", { name: /The tools issue/ })
        .closest("li"),
    ).not.toHaveTextContent("Numbers");
  });

  it("lists issues with their status, ready articles and the editor's drafts", () => {
    renderWithIntl(<EditorDesk slug="amsterdam-ai" canManage />);

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
    ).toHaveAttribute("href", "/communities/amsterdam-ai/magazine/settings");
  });
});
