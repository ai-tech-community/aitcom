import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

vi.mock("@/trpc/react", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    api: {
      feed: {
        toggleLike: { useMutation: mutation },
        editPost: { useMutation: mutation },
        deletePost: { useMutation: mutation },
        pinPost: { useMutation: mutation },
      },
    },
  };
});
vi.mock("@/components/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ requireAuth: (fn: () => void) => fn() }),
}));
vi.mock("./feed-comments", () => ({ FeedComments: () => null }));

const playerProps = vi.fn();
vi.mock("./feed-video-player", () => ({
  FeedVideoPlayer: (props: unknown) => {
    playerProps(props);
    return <div data-testid="player" />;
  },
}));
const bannerProps = vi.fn();
vi.mock("./reported-banner", () => ({
  ReportedBanner: (props: unknown) => {
    bannerProps(props);
    return <div data-testid="banner" />;
  },
}));
vi.mock("./report-dialog", () => ({
  ReportDialog: ({ open, postId }: { open: boolean; postId: number }) =>
    open ? <div data-testid="report-dialog">{postId}</div> : null,
}));

import { FeedPostCard } from "./feed-post-card";

const video = {
  url: "https://v/1.mp4",
  thumbnailUrl: "https://v/1.jpg",
  durationSeconds: 12,
  width: 720,
  height: 1280,
  visibility: "public" as const,
};

const basePost = {
  id: 7,
  content: "Look at this",
  authorId: "author-1",
  authorName: "Ada",
  createdAt: "2026-09-24T10:00:00Z",
  hasLiked: false,
};

function renderCard(
  post: Partial<React.ComponentProps<typeof FeedPostCard>["post"]> = {},
  props: Partial<React.ComponentProps<typeof FeedPostCard>> = {},
) {
  const onRefresh = vi.fn().mockResolvedValue(undefined);
  render(
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-09-24T12:00:00Z")}
      timeZone="UTC"
    >
      <FeedPostCard
        post={{ ...basePost, ...post }}
        currentUserId="viewer-1"
        memberRole="member"
        communitySlug="town"
        onRefresh={onRefresh}
        onToggleComments={vi.fn()}
        showComments={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
  return { onRefresh };
}

describe("FeedPostCard video and moderation", () => {
  beforeEach(() => {
    playerProps.mockClear();
    bannerProps.mockClear();
  });

  it("plays the video and asks the feed for fresh links when one expires", async () => {
    const { onRefresh } = renderCard({ video });
    expect(screen.getByTestId("player")).toBeInTheDocument();
    const props = playerProps.mock.calls.at(-1)![0] as {
      video: unknown;
      onExpired: () => Promise<boolean>;
    };
    expect(props.video).toEqual(video);
    // Resolves only after the refetch, so the player compares the new URL.
    await expect(props.onExpired()).resolves.toBe(true);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("shows no public badge for a community-only video", () => {
    renderCard({ video: { ...video, visibility: "community" } });
    expect(screen.queryByText("Public")).not.toBeInTheDocument();
  });

  it("lets a signed-in member report someone else's post", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByTestId("report-dialog")).toHaveTextContent("7");
  });

  it("offers no Report to the author", () => {
    renderCard({}, { currentUserId: "author-1" });
    expect(
      screen.queryByRole("button", { name: "Report" }),
    ).not.toBeInTheDocument();
  });

  it("offers no Report to a signed-out visitor", () => {
    renderCard({}, { currentUserId: null });
    expect(
      screen.queryByRole("button", { name: "Report" }),
    ).not.toBeInTheDocument();
  });

  it("shows the reported banner to the author without review rights", () => {
    renderCard(
      { hiddenAt: "2026-09-24T11:00:00Z" },
      { currentUserId: "author-1" },
    );
    expect(bannerProps).toHaveBeenCalledWith({ postId: 7, canReview: false });
  });

  it("gives moderators review rights on a reported post", () => {
    renderCard(
      { hiddenAt: "2026-09-24T11:00:00Z" },
      { memberRole: "moderator" },
    );
    expect(bannerProps).toHaveBeenCalledWith({ postId: 7, canReview: true });
    expect(
      screen.queryByRole("button", { name: "Report" }),
    ).not.toBeInTheDocument();
  });

  it("shows no banner on a post that was not reported", () => {
    renderCard();
    expect(screen.queryByTestId("banner")).not.toBeInTheDocument();
  });
});
