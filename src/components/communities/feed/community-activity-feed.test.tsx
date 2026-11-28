import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import {
  openMemberCard,
  PRIVATE_MEMBER_CARD,
} from "@/test/member-card-fixture";
import { CommunityActivityFeed } from "./community-activity-feed";

const { query, topicQuery, fetchNextPage } = vi.hoisted(() => ({
  query: { current: {} as Record<string, unknown> },
  topicQuery: vi.fn(),
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
    useUtils: () => ({
      feed: {
        getActivity: { invalidate: vi.fn() },
        getFeed: { invalidate: vi.fn() },
      },
    }),
    feed: {
      getActivity: { useInfiniteQuery: () => query.current },
      getFeed: { useInfiniteQuery: topicQuery },
    },
  },
}));

const AT = "2026-09-23T10:00:00.000Z";

/** The "who did what" line of an activity row, as one reads it. */
function sentenceOf(container: HTMLElement, kind: string) {
  return container.querySelector(`[data-activity-row="${kind}"] p > span`)
    ?.textContent;
}

function post(id: number, content: string) {
  return {
    id,
    content,
    authorId: "u1",
    authorName: "Greg",
    authorImage: null,
    authorCard: openMemberCard(),
    communityId: "c1",
    createdAt: AT,
    updatedAt: AT,
    hasLiked: false,
  };
}

function renderFeed(
  pages: unknown[],
  extra: Record<string, unknown> = {},
  {
    firstWeek,
    home,
  }: Pick<
    React.ComponentProps<typeof CommunityActivityFeed>,
    "firstWeek" | "home"
  > = {},
) {
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
        firstWeek={firstWeek}
        home={home}
      />
    </NextIntlClientProvider>,
  );
}

describe("CommunityActivityFeed", () => {
  it("leaves the empty state to the owner setup without hiding real activity", () => {
    const empty = renderFeed(
      [
        {
          pinned: [],
          items: [
            {
              kind: "joins",
              key: "join:owner",
              at: AT,
              members: [
                {
                  id: "u1",
                  name: "Owner",
                  image: null,
                  card: openMemberCard(),
                },
              ],
            },
          ],
        },
      ],
      {},
      { firstWeek: true },
    );
    expect(screen.queryByText("Nothing here yet")).not.toBeInTheDocument();
    expect(
      empty.container.querySelector('[data-activity-row="joins"]'),
    ).toBeNull();
    expect(
      empty.container.querySelector("[data-community-activity]"),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Ask a question" }),
    ).not.toBeInTheDocument();
    empty.unmount();
    renderFeed(
      [{ pinned: [post(9, "Welcome to the club")], items: [] }],
      {},
      { firstWeek: true },
    );
    expect(screen.getByText("Welcome to the club")).toBeInTheDocument();
  });

  it.each([
    undefined,
    { topic: "all", topicLabels: new Map(), resetTopic: vi.fn() },
  ])(
    "keeps other members in a join group when the owner is filtered out (%o)",
    (home) => {
      const { container } = renderFeed(
        [
          {
            pinned: [],
            items: [
              {
                kind: "joins",
                key: "join:group",
                at: AT,
                members: [
                  {
                    id: "u1",
                    name: "Owner",
                    image: null,
                    card: openMemberCard(),
                  },
                  {
                    id: "u2",
                    name: "Rosa",
                    image: null,
                    card: openMemberCard(),
                  },
                ],
              },
            ],
          },
        ],
        {},
        { firstWeek: true, home },
      );
      expect(sentenceOf(container, "joins")).toBe("Rosa joined");
    },
  );

  it("puts pins for the selected topic above the filtered posts without duplicates", () => {
    const welcome = { ...post(9, "House rules"), topicSlug: "welcome" };
    const other = { ...post(6, "Off-topic pin"), topicSlug: "showcase" };
    topicQuery.mockReturnValueOnce({
      data: { pages: [{ posts: [welcome, post(3, "A new post")] }] },
    });
    renderFeed(
      [{ pinned: [welcome, other], items: [] }],
      {},
      {
        home: {
          topic: "welcome",
          topicLabels: new Map([["welcome", "Welcome"]]),
          resetTopic: vi.fn(),
        },
      },
    );
    expect(topicQuery).toHaveBeenCalledWith(
      { communitySlug: "mlops", limit: 20, topicSlug: "welcome" },
      expect.anything(),
    );
    const pins = screen.getByRole("region", { name: "Pinned" });
    expect(within(pins).getByText("House rules")).toBeInTheDocument();
    expect(screen.getAllByText("House rules")).toHaveLength(1);
    expect(screen.queryByText("Off-topic pin")).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Latest" })).getByText(
        "A new post",
      ),
    ).toBeInTheDocument();
  });

  it("still shows a topic while the broader activity request has failed", () => {
    const pin = { ...post(9, "A pinned topic post"), isPinned: true };
    topicQuery.mockReturnValueOnce({
      data: { pages: [{ posts: [pin, post(3, "A newer topic post")] }] },
    });
    renderFeed(
      [],
      { data: undefined, isError: true },
      {
        home: {
          topic: "welcome",
          topicLabels: new Map(),
          resetTopic: vi.fn(),
        },
      },
    );
    expect(
      within(screen.getByRole("region", { name: "Pinned" })).getByText(
        "A pinned topic post",
      ),
    ).toBeVisible();
    expect(
      within(screen.getByRole("region", { name: "Latest" })).getByText(
        "A newer topic post",
      ),
    ).toBeVisible();
  });

  it("keeps the next page reachable when no decorated activity is visible yet", () => {
    fetchNextPage.mockClear();
    renderFeed(
      [{ pinned: [], items: [] }],
      { hasNextPage: true },
      {
        home: {
          topic: "all",
          topicLabels: new Map(),
          resetTopic: vi.fn(),
        },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

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
              authorId: "u-greg",
              authorName: "Greg",
              authorImage: null,
              authorCard: openMemberCard(),
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
              authorId: "u-ann",
              authorName: "Ann",
              authorImage: null,
              authorCard: PRIVATE_MEMBER_CARD,
              voteCount: 4,
              status: "open",
            },
          },
          {
            kind: "joins",
            key: "join:a",
            at: AT,
            members: [
              { id: "a", name: "Ann", image: null, card: openMemberCard() },
              { id: "b", name: "Ben", image: null, card: openMemberCard() },
              { id: "c", name: "Cas", image: null, card: openMemberCard() },
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

    expect(sentenceOf(container, "thread")).toBe("Greg asked a question");
    expect(
      screen.getByRole("link", { name: /Help with 3D Artist/ }),
    ).toHaveAttribute("href", "/communities/mlops/forum/help-with-3d-artist");
    expect(screen.getByText("2 replies")).toBeInTheDocument();
    expect(screen.getByText("New event")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /MLOps Night/ })).toHaveAttribute(
      "href",
      "/events/mlops-night",
    );
    expect(sentenceOf(container, "idea")).toBe("Ann suggested an idea");
    expect(screen.getByText("4 votes")).toBeInTheDocument();
    expect(sentenceOf(container, "joins")).toBe("Ann, Ben and 1 other joined");
  });

  it("links every person's name to their profile, with a preview on hover", async () => {
    const { container } = renderFeed([
      {
        pinned: [],
        nextCursor: null,
        items: [
          {
            kind: "thread",
            key: "thread:1",
            at: AT,
            thread: {
              id: 1,
              slug: "welcome",
              title: "Welcome",
              category: "general",
              authorId: "u-greg",
              authorName: "Greg",
              authorImage: null,
              authorCard: openMemberCard(),
              replyCount: 3,
            },
          },
          {
            kind: "idea",
            key: "idea:5",
            at: AT,
            idea: {
              id: 5,
              title: "Monthly paper club",
              authorId: "u-ann",
              authorName: "Ann",
              authorImage: null,
              authorCard: PRIVATE_MEMBER_CARD,
              voteCount: 4,
              status: "open",
            },
          },
          {
            kind: "joins",
            key: "join:a",
            at: AT,
            members: [
              {
                id: "u-naomi",
                name: "Naomi",
                image: null,
                card: openMemberCard(),
              },
              { id: "u-ben", name: "Ben", image: null, card: openMemberCard() },
            ],
          },
        ],
      },
    ]);

    const greg = screen.getByRole("link", { name: "Greg" });
    expect(greg).toHaveAttribute("href", "/members/u-greg");
    expect(screen.getByRole("link", { name: "Naomi" })).toHaveAttribute(
      "href",
      "/members/u-naomi",
    );
    expect(screen.getByRole("link", { name: "Ben" })).toHaveAttribute(
      "href",
      "/members/u-ben",
    );
    // A private profile is named, never linked.
    const ideaRow = container.querySelector('[data-activity-row="idea"]')!;
    expect(ideaRow.querySelector('a[href^="/members/"]')).toBeNull();

    fireEvent.pointerEnter(greg);
    expect(await screen.findByText("@ Acme")).toBeInTheDocument();
    expect(screen.getByText("Level 3 · Beginner")).toBeInTheDocument();
  });

  it("dates an event by its own day, even for a viewer west of UTC", () => {
    const originalTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      const { container } = renderFeed([
        {
          pinned: [],
          nextCursor: null,
          items: [
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
                startTime: "19:00",
                endTime: "21:00",
                timezone: "Europe/Amsterdam",
                location: "Amsterdam",
              },
            },
          ],
        },
      ]);

      const tile = container.querySelector("[data-activity-row] time");
      expect(tile).toHaveAttribute("dateTime", "2026-10-05");
      expect(tile).toHaveTextContent("Oct05");
      expect(
        screen.getByText("Mon 5 Oct · 19:00–21:00 CEST · Amsterdam"),
      ).toBeInTheDocument();
    } finally {
      process.env.TZ = originalTz;
    }
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
