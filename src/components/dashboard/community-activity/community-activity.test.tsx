import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const { query, postCards, activityRows, invalidate, setInfiniteData } =
  vi.hoisted(() => ({
    query: { current: {} as Record<string, unknown> },
    postCards: [] as Record<string, unknown>[],
    activityRows: [] as Record<string, unknown>[],
    invalidate: vi.fn(),
    setInfiniteData: vi.fn(),
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

vi.mock("@/components/communities/feed/feed-post-card", () => ({
  FeedPostCard: (props: { post: { id: number; content: string } }) => {
    postCards.push(props);
    return (
      <article data-post-card={props.post.id}>{props.post.content}</article>
    );
  },
}));

vi.mock("@/components/communities/feed/activity-row", () => ({
  ActivityRow: (props: { item: { key: string } }) => {
    activityRows.push(props);
    return <article data-activity-row={props.item.key} />;
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: { getHomeActivity: { invalidate, setInfiniteData } },
    }),
    feed: {
      getHomeActivity: { useInfiniteQuery: () => query.current },
    },
  },
}));

import { CommunityActivity } from "./community-activity";

const AT = "2026-09-23T10:00:00.000Z";

const MAKERS = {
  id: "c1",
  slug: "makers",
  name: "Makers",
  logoUrl: "https://example.test/makers.png",
  viewerRole: "moderator",
};
const BUILDERS = {
  id: "c2",
  slug: "builders",
  name: "Builders",
  logoUrl: null,
  viewerRole: "member",
};

function postItem(id: number, community: typeof MAKERS | typeof BUILDERS) {
  return {
    kind: "post",
    key: `post:${id}`,
    at: AT,
    communityId: community.id,
    community,
    post: { id, content: `Post ${id}`, authorId: "u2", createdAt: AT },
  };
}

function threadItem(id: number, community: typeof MAKERS | typeof BUILDERS) {
  return {
    kind: "thread",
    key: `thread:${id}`,
    at: AT,
    communityId: community.id,
    community,
    thread: { id, slug: `t-${id}`, title: `Thread ${id}` },
  };
}

function renderSection(
  pages: unknown[] | undefined,
  extra: Record<string, unknown> = {},
) {
  query.current = {
    data: pages ? { pages } : undefined,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
    ...extra,
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CommunityActivity currentUserId="u1" />
    </NextIntlClientProvider>,
  );
}

const t = en.dashboard.communityActivity;

beforeEach(() => {
  postCards.length = 0;
  activityRows.length = 0;
  invalidate.mockReset();
  setInfiniteData.mockReset();
});

describe("CommunityActivity", () => {
  it("labels every entry with a link to its community", () => {
    renderSection([
      {
        items: [postItem(1, MAKERS), threadItem(2, BUILDERS)],
        nextCursor: null,
        hasJoinedCommunities: true,
      },
    ]);

    expect(screen.getByRole("heading", { name: t.title })).toBeInTheDocument();
    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(
      within(entries[0]!).getByRole("link", { name: "Makers" }),
    ).toHaveAttribute("href", "/communities/makers");
    expect(
      within(entries[1]!).getByRole("link", { name: "Builders" }),
    ).toHaveAttribute("href", "/communities/builders");
  });

  it("hands each post card its own community and the viewer's role there", () => {
    renderSection([
      {
        items: [postItem(1, MAKERS), postItem(2, BUILDERS)],
        nextCursor: null,
        hasJoinedCommunities: true,
      },
    ]);

    expect(postCards).toHaveLength(2);
    expect(postCards[0]).toMatchObject({
      communitySlug: "makers",
      memberRole: "moderator",
      currentUserId: "u1",
    });
    expect(postCards[1]).toMatchObject({
      communitySlug: "builders",
      memberRole: "member",
    });
    void (postCards[0]!.onRefresh as () => void)();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("links non-post entries into their own community", () => {
    renderSection([
      {
        items: [threadItem(2, BUILDERS)],
        nextCursor: null,
        hasJoinedCommunities: true,
      },
    ]);
    expect(activityRows).toHaveLength(1);
    expect(activityRows[0]).toMatchObject({ slug: "builders" });
  });

  it("loads the next page on request", () => {
    const fetchNextPage = vi.fn();
    renderSection(
      [
        {
          items: [postItem(1, MAKERS)],
          nextCursor: { at: AT, key: "post:1" },
          hasJoinedCommunities: true,
        },
      ],
      { hasNextPage: true, fetchNextPage },
    );
    fireEvent.click(screen.getByRole("button", { name: t.loadMore }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("invites a member with no news and no joined community to find one", () => {
    renderSection([
      { items: [], nextCursor: null, hasJoinedCommunities: false },
    ]);
    expect(screen.getByText(t.notJoinedTitle)).toBeInTheDocument();
    expect(screen.getByText(t.notJoinedDescription)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.findCommunity })).toHaveAttribute(
      "href",
      "/communities",
    );
  });

  it("says it is quiet when the member's communities have no news", () => {
    renderSection([
      { items: [], nextCursor: null, hasJoinedCommunities: true },
    ]);
    expect(screen.getByText(t.quietTitle)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.exploreCommunities }),
    ).toHaveAttribute("href", "/communities");
  });

  it("shows Hub news with a prompt above it to a member who joined nothing else", () => {
    const HUB = { ...BUILDERS, id: "hub", slug: "ait", name: "Hub" };
    renderSection([
      {
        items: [postItem(1, HUB)],
        nextCursor: null,
        hasJoinedCommunities: false,
      },
    ]);
    expect(screen.getByText(t.notJoinedTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.findCommunity })).toHaveAttribute(
      "href",
      "/communities",
    );
    expect(postCards).toHaveLength(1);
  });

  it("leaves out the prompt once the member has joined a community", () => {
    renderSection([
      {
        items: [postItem(1, MAKERS)],
        nextCursor: null,
        hasJoinedCommunities: true,
      },
    ]);
    expect(screen.queryByText(t.notJoinedTitle)).not.toBeInTheDocument();
  });

  it("updates a like and a delete in the cache instead of refetching", () => {
    renderSection([
      {
        items: [postItem(1, MAKERS), postItem(2, BUILDERS)],
        nextCursor: null,
        hasJoinedCommunities: true,
      },
    ]);
    const onPostChange = postCards[0]!.onPostChange as (
      change: unknown,
    ) => void;
    const cached = {
      pages: [
        {
          items: [
            {
              ...postItem(1, MAKERS),
              post: { id: 1, hasLiked: false, likeCount: 0 },
            },
            {
              ...postItem(2, BUILDERS),
              post: { id: 2, hasLiked: false, likeCount: 4 },
            },
          ],
        },
      ],
      pageParams: [null],
    };

    onPostChange({ kind: "liked", postId: 1, liked: true, likeCount: 1 });
    const [likeKey, likeUpdate] = setInfiniteData.mock.calls[0]!;
    expect(likeKey).toEqual({ limit: 15 });
    const liked = (likeUpdate as (d: typeof cached) => typeof cached)(cached);
    expect(liked.pages[0]!.items[0]!.post).toMatchObject({
      hasLiked: true,
      likeCount: 1,
    });
    expect(liked.pages[0]!.items[1]).toBe(cached.pages[0]!.items[1]);

    onPostChange({ kind: "deleted", postId: 2 });
    const [, deleteUpdate] = setInfiniteData.mock.calls[1]!;
    const removed = (deleteUpdate as (d: typeof cached) => typeof cached)(
      cached,
    );
    expect(removed.pages[0]!.items.map((item) => item.key)).toEqual(["post:1"]);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("says so in place when loading more fails, with a retry", () => {
    const fetchNextPage = vi.fn();
    renderSection(
      [
        {
          items: [postItem(1, MAKERS)],
          nextCursor: { at: AT, key: "post:1" },
          hasJoinedCommunities: true,
        },
      ],
      {
        hasNextPage: true,
        isError: true,
        isFetchNextPageError: true,
        fetchNextPage,
      },
    );
    // The loaded entries stay.
    expect(postCards).toHaveLength(1);
    expect(screen.getByRole("alert")).toHaveTextContent(
      en.common.loadMoreError,
    );
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows an error with retry when the first page fails", () => {
    const refetch = vi.fn();
    renderSection(undefined, { isError: true, refetch });
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
