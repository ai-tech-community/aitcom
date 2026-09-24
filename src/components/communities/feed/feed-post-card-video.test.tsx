// The feed card with the real video player: what the viewer sees when a
// private link fails and the feed refetch does or does not bring a new one.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
vi.mock("./reported-banner", () => ({ ReportedBanner: () => null }));
vi.mock("./report-dialog", () => ({ ReportDialog: () => null }));

import { FeedPostCard } from "./feed-post-card";
import { FRESH_LINK_SETTLE_MS } from "./feed-video-player";

const load = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    },
  );
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  Object.defineProperty(HTMLMediaElement.prototype, "load", {
    configurable: true,
    value: load,
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  load.mockClear();
});

const video = {
  url: "https://v/private-1.mp4",
  thumbnailUrl: "https://v/private-1.jpg",
  durationSeconds: 12,
  width: 720,
  height: 1280,
  visibility: "community" as const,
};

const post = {
  id: 7,
  content: "Look at this",
  authorId: "author-1",
  authorName: "Ada",
  createdAt: "2026-09-24T10:00:00Z",
  hasLiked: false,
  video,
};

function renderCard(onRefresh: () => Promise<unknown>) {
  const ui = (url: string) => (
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-09-24T12:00:00Z")}
      timeZone="UTC"
    >
      <FeedPostCard
        post={{ ...post, video: { ...video, url } }}
        currentUserId="viewer-1"
        memberRole="member"
        communitySlug="town"
        onRefresh={onRefresh}
        onToggleComments={vi.fn()}
        showComments={false}
      />
    </NextIntlClientProvider>
  );
  const view = render(ui(video.url));
  return { ...view, showUrl: (url: string) => view.rerender(ui(url)) };
}

describe("FeedPostCard video refresh", () => {
  it("shows Video unavailable when the refetched feed brings the same link", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const { container } = renderCard(onRefresh);
    fireEvent.error(container.querySelector("video")!);
    await act(async () => undefined);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(FRESH_LINK_SETTLE_MS);
    });
    expect(screen.getByText("Video unavailable.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("plays the new link when the refetched feed brings one", async () => {
    let view: ReturnType<typeof renderCard> | null = null;
    const onRefresh = vi.fn(async () => {
      view!.showUrl("https://v/private-1-fresh.mp4");
    });
    view = renderCard(onRefresh);
    fireEvent.error(view.container.querySelector("video")!);
    await act(async () => undefined);
    act(() => {
      vi.advanceTimersByTime(FRESH_LINK_SETTLE_MS);
    });
    expect(screen.queryByText("Video unavailable.")).not.toBeInTheDocument();
    expect(view.container.querySelector("video")).toHaveAttribute(
      "src",
      "https://v/private-1-fresh.mp4",
    );
  });
});
