import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const m = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  likeMutate: vi.fn(),
  push: vi.fn(),
  promptAuth: vi.fn(),
  reelsUtils: {
    cancel: vi.fn(),
    getInfiniteData: vi.fn(),
    setInfiniteData: vi.fn(),
    invalidate: vi.fn(),
    fetch: vi.fn(),
  },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ feed: { getReels: m.reelsUtils } }),
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
    onExpired,
  }: {
    video: { url: string };
    preload?: string;
    onExpired?: () => void | Promise<boolean>;
  }) => {
    // Stands in for the real player's contract: a false or failed answer
    // means no fresh link is coming, so it shows "Video unavailable".
    const [failed, setFailed] = useState(false);
    return (
      <div data-testid="player" data-src={video.url} data-preload={preload}>
        <button
          type="button"
          onClick={() => {
            const answer = onExpired?.();
            if (answer)
              answer.then(
                (ok) => setFailed(!ok),
                () => setFailed(true),
              );
          }}
        >
          {`expire ${video.url}`}
        </button>
        {failed ? <p>Video unavailable.</p> : null}
      </div>
    );
  },
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

function setPages(pages: unknown[]) {
  m.query = {
    data: { pages },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

function renderViewer(pages: unknown[], viewer: Viewer = MEMBER) {
  setPages(pages);
  const ui = () => (
    <NextIntlClientProvider locale="en" messages={en}>
      <ReelsViewer
        slug="mlops"
        startAtPostId={null}
        currentUserId={viewer.currentUserId}
        memberRole={viewer.memberRole}
        membershipStatus={viewer.memberRole ? "active" : null}
        joinPolicy="open"
      />
    </NextIntlClientProvider>
  );
  const view = render(ui());
  return {
    ...view,
    rerenderWith: (next: unknown[]) => {
      setPages(next);
      view.rerender(ui());
    },
  };
}

const page = (items: unknown[], notice: string | null = null) => ({
  items,
  nextCursor: null,
  notice,
});

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  Object.values(m.reelsUtils).forEach((fn) => fn.mockReset());
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
  it("re-signs only the reel whose link expired, without refetching the list", async () => {
    const fresh = { ...reel(2).video, url: "https://v/2-fresh.mp4" };
    m.reelsUtils.fetch.mockResolvedValue({
      items: [{ ...reel(2), video: fresh }],
      nextCursor: null,
      notice: null,
    });
    renderViewer([page([reel(1), reel(2)])]);
    fireEvent.click(
      screen.getByRole("button", { name: "expire https://v/2.mp4" }),
    );
    await waitFor(() =>
      expect(m.reelsUtils.setInfiniteData).toHaveBeenCalled(),
    );
    expect(m.reelsUtils.fetch).toHaveBeenCalledWith(
      { communitySlug: "mlops", startAtPostId: 2, limit: 1 },
      expect.anything(),
    );
    expect(m.query.refetch).not.toHaveBeenCalled();
    const [key, update] = m.reelsUtils.setInfiniteData.mock.calls[0]!;
    expect(key).toEqual({
      communitySlug: "mlops",
      limit: 8,
      startAtPostId: null,
    });
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
    const cached = { pageParams: [null], pages: [page([reel(1), reel(2)])] };
    const next = update(cached);
    expect(next.pages[0].items[0]).toBe(cached.pages[0]!.items[0]);
    expect(next.pages[0].items[1].video.url).toBe("https://v/2-fresh.mp4");
  });

  it("stays on the same video when newer reels arrive on top", () => {
    const view = renderViewer([page([reel(1), reel(2), reel(3)])]);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Reels" }), {
      key: "ArrowDown",
    });
    expect(screen.getByText("Video 2 of 3")).toBeInTheDocument();
    view.rerenderWith([page([reel(9), reel(1), reel(2), reel(3)])]);
    expect(screen.getByText("Video 3 of 4")).toBeInTheDocument();
    expect(
      screen.getAllByTestId("player").map((p) => p.getAttribute("data-src")),
    ).toEqual(["https://v/2.mp4", "https://v/3.mp4"]);
  });

  it("clamps to the last reel when the list shrinks under it", () => {
    const view = renderViewer([page([reel(1), reel(2), reel(3)])]);
    const dialog = screen.getByRole("dialog", { name: "Reels" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(screen.getByText("Video 3 of 3")).toBeInTheDocument();
    view.rerenderWith([page([reel(1), reel(2)])]);
    expect(screen.getByText("Video 2 of 2")).toBeInTheDocument();
  });

  it("moves two reels on a quick double down-arrow", () => {
    renderViewer([page([reel(1), reel(2), reel(3)])]);
    const dialog = screen.getByRole("dialog", { name: "Reels" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(screen.getByText("Video 3 of 3")).toBeInTheDocument();
  });

  it("shows unavailable when re-signing an expired link fails", async () => {
    m.reelsUtils.fetch.mockRejectedValue(new Error("offline"));
    renderViewer([page([reel(1), reel(2)])]);
    fireEvent.click(
      screen.getByRole("button", { name: "expire https://v/1.mp4" }),
    );
    expect(await screen.findByText("Video unavailable.")).toBeInTheDocument();
    expect(m.reelsUtils.setInfiniteData).not.toHaveBeenCalled();
  });

  it("shows unavailable when the video can no longer be watched", async () => {
    m.reelsUtils.fetch.mockResolvedValue(page([], "unavailable"));
    renderViewer([page([reel(1), reel(2)])]);
    fireEvent.click(
      screen.getByRole("button", { name: "expire https://v/1.mp4" }),
    );
    expect(await screen.findByText("Video unavailable.")).toBeInTheDocument();
    expect(m.reelsUtils.setInfiniteData).not.toHaveBeenCalled();
  });

  describe("scrolling", () => {
    function scroller(height = 800) {
      const el = document.querySelector(
        '[aria-roledescription="slide"]',
      )!.parentElement!;
      Object.defineProperty(el, "clientHeight", {
        configurable: true,
        value: height,
      });
      return el;
    }
    function scrollTo(el: HTMLElement, top: number) {
      el.scrollTop = top;
      fireEvent.scroll(el);
    }

    it("ignores the in-between frames of a smooth scroll started by a key", () => {
      vi.useFakeTimers();
      renderViewer([page([reel(1), reel(2), reel(3)])]);
      const el = scroller();
      fireEvent.keyDown(screen.getByRole("dialog", { name: "Reels" }), {
        key: "ArrowDown",
      });
      scrollTo(el, 100);
      scrollTo(el, 300);
      expect(screen.getByText("Video 2 of 3")).toBeInTheDocument();
      scrollTo(el, 800);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText("Video 2 of 3")).toBeInTheDocument();
    });

    it("follows a swipe once it comes to rest", () => {
      vi.useFakeTimers();
      renderViewer([page([reel(1), reel(2), reel(3)])]);
      const el = scroller();
      scrollTo(el, 900);
      expect(screen.getByText("Video 1 of 3")).toBeInTheDocument();
      scrollTo(el, 1600);
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByText("Video 3 of 3")).toBeInTheDocument();
    });

    it("reads the resting reel at once on scrollend", () => {
      renderViewer([page([reel(1), reel(2), reel(3)])]);
      const el = scroller();
      el.scrollTop = 800;
      fireEvent(el, new Event("scrollend"));
      expect(screen.getByText("Video 2 of 3")).toBeInTheDocument();
    });
  });
});
