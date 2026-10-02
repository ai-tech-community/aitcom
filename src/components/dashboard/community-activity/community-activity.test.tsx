import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const { query, postCards, activityRows, invalidate } = vi.hoisted(() => ({
  query: { current: {} as Record<string, unknown> },
  postCards: [] as Record<string, unknown>[],
  activityRows: [] as Record<string, unknown>[],
  invalidate: vi.fn(),
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
    useUtils: () => ({ feed: { getHomeActivity: { invalidate } } }),
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
});

describe("CommunityActivity", () => {
  it("labels every entry with a link to its community", () => {
    renderSection([
      {
        items: [postItem(1, MAKERS), threadItem(2, BUILDERS)],
        nextCursor: null,
        hasCommunities: true,
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
        hasCommunities: true,
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
        hasCommunities: true,
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
          hasCommunities: true,
        },
      ],
      { hasNextPage: true, fetchNextPage },
    );
    fireEvent.click(screen.getByRole("button", { name: t.loadMore }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("points a member without communities to the directory", () => {
    renderSection([{ items: [], nextCursor: null, hasCommunities: false }]);
    expect(screen.getByText(t.noCommunities)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: t.noCommunitiesLink }),
    ).toHaveAttribute("href", "/communities");
  });

  it("says it is quiet when the member's communities have no news", () => {
    renderSection([{ items: [], nextCursor: null, hasCommunities: true }]);
    expect(screen.getByText(t.quiet)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.quietLink })).toHaveAttribute(
      "href",
      "/communities",
    );
  });

  it("shows an error with retry when the first page fails", () => {
    const refetch = vi.fn();
    renderSection(undefined, { isError: true, refetch });
    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
