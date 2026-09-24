import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  likeMutate: vi.fn(),
  push: vi.fn(),
  promptAuth: vi.fn(),
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: {
        getReels: {
          cancel: vi.fn(),
          getInfiniteData: vi.fn(),
          setInfiniteData: vi.fn(),
          invalidate: vi.fn(),
        },
      },
    }),
    feed: {
      getReels: { useInfiniteQuery: () => m.query },
      toggleLike: {
        useMutation: () => ({ mutate: m.likeMutate, isPending: false }),
      },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: m.push, back: vi.fn(), replace: vi.fn() }),
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/auth/auth-required-dialog", () => ({
  useRequireAuth: () => ({ promptAuth: m.promptAuth, requireAuth: vi.fn() }),
}));
vi.mock("../feed/feed-video-player", () => ({
  FeedVideoPlayer: ({
    video,
    preload,
  }: {
    video: { url: string };
    preload?: string;
  }) => (
    <div data-testid="player" data-src={video.url} data-preload={preload} />
  ),
}));
vi.mock("../feed/feed-comments", () => ({
  FeedComments: ({ postId }: { postId: number }) => (
    <textarea aria-label={`comments for ${postId}`} />
  ),
}));
vi.mock("../feed/report-dialog", () => ({
  ReportDialog: ({ postId, open }: { postId: number; open: boolean }) =>
    open ? <div data-testid="report-dialog">{postId}</div> : null,
}));
vi.mock("../join-button", () => ({
  JoinButton: () => <button type="button">Join Community</button>,
}));

import { ReelsViewer } from "./reels-viewer";

const reel = (id: number, extra: Record<string, unknown> = {}) => ({
  id,
  content: `Clip ${id}`,
  authorId: "author-1",
  authorName: "Greg",
  authorImage: null,
  likeCount: 3,
  commentCount: 1,
  hasLiked: false,
  hiddenAt: null,
  video: {
    url: `https://v/${id}.mp4`,
    thumbnailUrl: `https://v/${id}.jpg`,
    durationSeconds: 9,
    width: 720,
    height: 1280,
    visibility: "public",
  },
  ...extra,
});

type Viewer = {
  currentUserId: string | null;
  memberRole: "owner" | "admin" | "moderator" | "member" | null;
};
const MEMBER: Viewer = { currentUserId: "user-9", memberRole: "member" };
const SIGNED_OUT: Viewer = { currentUserId: null, memberRole: null };
const OUTSIDER: Viewer = { currentUserId: "user-9", memberRole: null };

function renderViewer(pages: unknown[], viewer: Viewer = MEMBER) {
  m.query = {
    data: { pages },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReelsViewer
        slug="mlops"
        startAtPostId={null}
        currentUserId={viewer.currentUserId}
        memberRole={viewer.memberRole}
        membershipStatus={viewer.memberRole ? "active" : null}
        joinPolicy="open"
      />
    </NextIntlClientProvider>,
  );
}

const page = (items: unknown[], notice: string | null = null) => ({
  items,
  nextCursor: null,
  notice,
});

beforeEach(() => {
  m.likeMutate.mockClear();
  m.push.mockClear();
  m.promptAuth.mockClear();
});

describe("ReelsViewer", () => {
  it("is a labelled full-screen dialog that takes focus", () => {
    renderViewer([page([reel(1)])]);
    const dialog = screen.getByRole("dialog", { name: "Reels" });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it("shows one video at a time and moves with the arrow keys", () => {
    renderViewer([page([reel(1), reel(2)])]);
    const dialog = screen.getByRole("dialog", { name: "Reels" });
    expect(screen.getByText("Video 1 of 2")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(screen.getByText("Video 2 of 2")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(screen.getByText("Video 2 of 2")).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    expect(screen.getByText("Video 1 of 2")).toBeInTheDocument();
  });

  it("closes with Esc, back to the community page", () => {
    renderViewer([page([reel(1)])]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Reels" }), {
      key: "Escape",
    });
    expect(m.push).toHaveBeenCalledWith("/communities/mlops");
  });

  it("closes with a labelled link", () => {
    renderViewer([page([reel(1)])]);
    expect(screen.getByRole("link", { name: "Close reels" })).toHaveAttribute(
      "href",
      "/communities/mlops",
    );
  });

  it("mounts a video only for the current and the next reel", () => {
    renderViewer([page([reel(1), reel(2), reel(3), reel(4)])]);
    const sources = () =>
      screen.getAllByTestId("player").map((p) => p.getAttribute("data-src"));
    expect(sources()).toEqual(["https://v/1.mp4", "https://v/2.mp4"]);
    expect(
      screen
        .getAllByTestId("player")
        .map((p) => p.getAttribute("data-preload")),
    ).toEqual(["auto", "auto"]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Reels" }), {
      key: "ArrowDown",
    });
    expect(sources()).toEqual(["https://v/2.mp4", "https://v/3.mp4"]);
    expect(document.querySelectorAll('video, [src$=".mp4"]')).toHaveLength(0);
  });

  it("likes a video for a member", () => {
    renderViewer([page([reel(1)])]);
    const like = screen.getByRole("button", { name: /^Like/ });
    expect(like).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(like);
    expect(m.likeMutate).toHaveBeenCalledWith({ postId: 1 });
  });

  it("opens the comment sheet for a member, and keys typed there stay there", () => {
    renderViewer([page([reel(1), reel(2)])]);
    fireEvent.click(screen.getAllByRole("button", { name: "1 comment" })[0]!);
    const box = screen.getByLabelText("comments for 1");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getByText("Video 1 of 2")).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(m.push).not.toHaveBeenCalled();
  });

  it("asks a signed-out visitor to sign in instead of liking or commenting", () => {
    renderViewer([page([reel(1)])], SIGNED_OUT);
    fireEvent.click(screen.getByRole("button", { name: /^Like/ }));
    expect(m.promptAuth).toHaveBeenCalledWith("Sign in to like videos");
    fireEvent.click(screen.getByRole("button", { name: "1 comment" }));
    expect(m.promptAuth).toHaveBeenCalledWith("Sign in to comment on videos");
    expect(m.likeMutate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("comments for 1")).not.toBeInTheDocument();
  });

  it("offers Join to a signed-in non-member instead of liking", () => {
    renderViewer([page([reel(1)])], OUTSIDER);
    fireEvent.click(screen.getByRole("button", { name: /^Like/ }));
    expect(m.likeMutate).not.toHaveBeenCalled();
    const gate = screen.getByRole("dialog", {
      name: "Join to like and comment",
    });
    expect(
      within(gate).getByRole("button", { name: "Join Community" }),
    ).toBeInTheDocument();
  });

  it("offers Report to signed-in viewers who did not post the video", () => {
    renderViewer([page([reel(1)])], OUTSIDER);
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(screen.getByTestId("report-dialog")).toHaveTextContent("1");
  });

  it("hides Report from the author and from signed-out visitors", () => {
    renderViewer([page([reel(1, { authorId: "user-9" })])], MEMBER);
    expect(
      screen.queryByRole("button", { name: "Report" }),
    ).not.toBeInTheDocument();
  });

  it("hides Report from signed-out visitors", () => {
    renderViewer([page([reel(1)])], SIGNED_OUT);
    expect(
      screen.queryByRole("button", { name: "Report" }),
    ).not.toBeInTheDocument();
  });

  it("expands and collapses the caption when tapped", () => {
    renderViewer([page([reel(1)])]);
    const caption = screen.getByRole("button", { name: "Clip 1" });
    expect(caption).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(caption);
    expect(caption).toHaveAttribute("aria-expanded", "true");
  });

  it("tells a visitor a community-only link is for members and offers Join", () => {
    renderViewer([page([], "members_only")], SIGNED_OUT);
    expect(screen.getByText("This video is for members.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Join Community" }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("player")).not.toBeInTheDocument();
  });

  it("says when a linked video is not available", () => {
    renderViewer([page([], "unavailable")]);
    expect(screen.getByText("This video isn't available.")).toBeInTheDocument();
  });
});
