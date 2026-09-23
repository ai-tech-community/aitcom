import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { CommunityActivityFeed } from "./community-activity-feed";

const { query, fetchNextPage } = vi.hoisted(() => ({
  query: { current: {} as Record<string, unknown> },
  fetchNextPage: vi.fn(),
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

vi.mock("./feed-post-card", () => ({
  FeedPostCard: ({ post }: { post: { id: number; content: string } }) => (
    <article data-post-card={post.id}>{post.content}</article>
  ),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ feed: { getActivity: { invalidate: vi.fn() } } }),
    feed: {
      getActivity: { useInfiniteQuery: () => query.current },
    },
  },
}));

const AT = "2026-09-23T10:00:00.000Z";

function post(id: number, content: string) {
  return {
    id,
    content,
    authorId: "u1",
    authorName: "Greg",
    authorImage: null,
    communityId: "c1",
    createdAt: AT,
    updatedAt: AT,
    hasLiked: false,
  };
}

function renderFeed(pages: unknown[], extra: Record<string, unknown> = {}) {
  query.current = {
    data: { pages },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    ...extra,
  };
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-09-23T12:00:00.000Z")}
      timeZone="UTC"
    >
      <CommunityActivityFeed
        slug="mlops"
        currentUserId="u1"
        memberRole="member"
      />
    </NextIntlClientProvider>,
  );
}

describe("CommunityActivityFeed", () => {
  it("shows pinned posts first, then every kind of activity in order", () => {
    const { container } = renderFeed([
      {
        pinned: [post(9, "House rules")],
        nextCursor: null,
        items: [
          {
            kind: "thread",
            key: "thread:1",
            at: AT,
            thread: {
              id: 1,
              slug: "help-with-3d-artist",
              title: "Help with 3D Artist",
              category: "question",
              authorName: "Greg",
              authorImage: null,
              replyCount: 2,
            },
          },
          { kind: "post", key: "post:3", at: AT, post: post(3, "Hello all") },
          {
            kind: "event",
            key: "event:4",
            at: AT,
            event: {
              id: 4,
              slug: "mlops-night",
              title: "MLOps Night",
              type: "meetup",
              date: "2026-10-05T00:00:00.000Z",
              startTime: null,
              endTime: null,
              timezone: null,
              location: "Amsterdam",
            },
          },
          {
            kind: "idea",
            key: "idea:5",
            at: AT,
            idea: {
              id: 5,
              title: "Monthly paper club",
              authorName: "Ann",
              authorImage: null,
              voteCount: 4,
              status: "open",
            },
          },
          {
            kind: "joins",
            key: "join:a",
            at: AT,
            members: [
              { id: "a", name: "Ann", image: null },
              { id: "b", name: "Ben", image: null },
              { id: "c", name: "Cas", image: null },
            ],
          },
        ],
      },
    ]);

    const order = [
      ...container.querySelectorAll("[data-post-card], [data-activity-row]"),
    ].map(
      (node) =>
        node.getAttribute("data-post-card") ??
        node.getAttribute("data-activity-row"),
    );
    expect(order).toEqual(["9", "thread", "3", "event", "idea", "joins"]);

    expect(screen.getByText("Greg asked a question")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Help with 3D Artist/ }),
    ).toHaveAttribute("href", "/communities/mlops/forum/help-with-3d-artist");
    expect(screen.getByText("2 replies")).toBeInTheDocument();
    expect(screen.getByText("New event")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /MLOps Night/ })).toHaveAttribute(
      "href",
      "/events/mlops-night",
    );
    expect(screen.getByText("Ann suggested an idea")).toBeInTheDocument();
    expect(screen.getByText("4 votes")).toBeInTheDocument();
    expect(screen.getByText("Ann, Ben and 1 other joined")).toBeInTheDocument();
  });

  it("teaches the first step when the community has no activity", () => {
    renderFeed([{ pinned: [], items: [], nextCursor: null }]);
    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ask a question" }),
    ).toHaveAttribute("href", "/communities/mlops/forum");
  });

  it("loads the next page from the cursor", () => {
    renderFeed(
      [
        {
          pinned: [],
          nextCursor: { at: AT, key: "post:3" },
          items: [
            { kind: "post", key: "post:3", at: AT, post: post(3, "Hello") },
          ],
        },
      ],
      { hasNextPage: true },
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalled();
  });
});
