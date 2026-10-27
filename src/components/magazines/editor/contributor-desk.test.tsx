import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DraftMagazineArticle } from "@/server/magazines/magazine-articles";

import { writerArticle } from "../test-fixtures";
import { renderWithIntl } from "../test-intl";

const state = vi.hoisted(() => ({
  rows: [] as DraftMagazineArticle[],
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
  input: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/trpc/react", () => ({
  api: {
    magazines: {
      myMagazineArticles: {
        useQuery: (input: unknown) => {
          state.input(input);
          return {
            data: state.rows,
            isLoading: state.isLoading,
            isError: state.isError,
            refetch: state.refetch,
          };
        },
      },
    },
  },
}));

import { ContributorDesk } from "./contributor-desk";

beforeEach(() => {
  state.rows = [];
  state.isLoading = false;
  state.isError = false;
  vi.clearAllMocks();
});

describe("ContributorDesk", () => {
  it("shows the writer their articles with the editors' note", () => {
    state.rows = [
      writerArticle(1, {
        reviewStatus: "changes_requested",
        reviewNote: "Please explain the example.",
      }),
      writerArticle(2),
    ];
    const { container } = renderWithIntl(
      <ContributorDesk slug="amsterdam-ai" />,
    );
    expect(state.input).toHaveBeenCalledWith({ slug: "amsterdam-ai" });
    expect(
      screen.getByRole("region", { name: "Your writing desk" }),
    ).toBeInTheDocument();
    const changes = screen.getByRole("link", { name: /Story 1/ });
    expect(changes).toHaveAttribute(
      "href",
      "/communities/amsterdam-ai/magazine/articles/story-1/edit",
    );
    expect(changes).toHaveTextContent("Changes asked for");
    expect(screen.getByText("Note from the editors")).toBeInTheDocument();
    expect(screen.getByText("Please explain the example.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Story 2/ })).toHaveTextContent(
      "Not sent yet",
    );
    expect(
      screen.getByRole("link", { name: "Write an article" }),
    ).toHaveAttribute("href", "/communities/amsterdam-ai/magazine/write");
    expect(container.querySelector('[data-variant="default"]')).toBeNull();
  });

  it("only open articles are links", () => {
    state.rows = [
      writerArticle(1, { reviewStatus: "pending_review" }),
      writerArticle(2, { reviewStatus: "approved" }),
      writerArticle(3, {
        reviewStatus: "rejected",
        reviewNote: "Outside this issue's theme.",
      }),
    ];
    renderWithIntl(<ContributorDesk slug="amsterdam-ai" />);
    const rows = screen.getAllByRole("listitem");
    for (const [index, label] of [
      "With the editors",
      "Ready for an issue",
      "Not accepted",
    ].entries()) {
      expect(within(rows[index]!).getByText(label)).toBeInTheDocument();
      expect(within(rows[index]!).queryByRole("link")).toBeNull();
    }
    expect(screen.getByText("Outside this issue's theme.")).toBeInTheDocument();
    expect(screen.getByText("Note from the editors")).toBeInTheDocument();
  });

  it("teaches the next step when there is nothing yet", () => {
    renderWithIntl(<ContributorDesk slug="amsterdam-ai" />);
    expect(
      screen.getByText(
        "You have no articles in progress. Write one and send it to the editors.",
      ),
    ).toBeInTheDocument();
  });

  it("shows loading and offers retry when articles cannot load", () => {
    state.isLoading = true;
    const { container, unmount } = renderWithIntl(
      <ContributorDesk slug="amsterdam-ai" />,
    );
    expect(
      container.querySelector('[data-slot="skeleton"]'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/You have no articles in progress/)).toBeNull();
    unmount();
    state.isLoading = false;
    state.isError = true;
    renderWithIntl(<ContributorDesk slug="amsterdam-ai" />);
    expect(
      screen.getByText("This list could not be loaded."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
    expect(screen.queryByText(/You have no articles in progress/)).toBeNull();
  });
});
