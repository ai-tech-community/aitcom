import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";

const mutationOptions = vi.hoisted(
  () => ({}) as Record<string, { onSuccess?: (data: unknown) => void }>,
);
vi.mock("@/trpc/react", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  const capturing =
    (name: string) => (options: { onSuccess?: (data: unknown) => void }) => {
      mutationOptions[name] = options;
      return mutation();
    };
  return {
    api: {
      feed: {
        toggleLike: { useMutation: capturing("toggleLike") },
        editPost: { useMutation: mutation },
        deletePost: { useMutation: capturing("deletePost") },
        pinPost: { useMutation: mutation },
      },
    },
  };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: React.ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
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
const collageProps = vi.fn();
vi.mock("../gallery/gallery-collage", () => ({
  GalleryCollage: (props: unknown) => {
    collageProps(props);
    return (
      <div data-testid="collage">
        <button type="button">Photo in collage</button>
      </div>
    );
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

describe("FeedPostCard image", () => {
  it("uses the post alt text for a picture stored by URL", () => {
    renderCard({
      imageUrl: "https://cdn.example.test/post.png",
      imageAlt: "The town square",
    });
    expect(
      screen.getByRole("img", { name: "The town square" }),
    ).toHaveAttribute("src", "https://cdn.example.test/post.png");
  });
});

describe("FeedPostCard links", () => {
  const LINK = "https://claude.ai/artifact/QfGAfn6EPmuJngAgwsZoa9";
  const content = `Grok Bot cheat sheet ${LINK}`;

  it("makes a link in the text clickable, opening in a new tab", () => {
    renderCard({ content });
    const inline = screen
      .getAllByRole("link")
      .find((a) => a.textContent?.startsWith(LINK));
    expect(inline).toHaveAttribute("href", LINK);
    expect(inline).toHaveAttribute("target", "_blank");
    expect(inline?.getAttribute("rel")).toContain("noopener");
    expect(inline?.getAttribute("rel")).toContain("ugc");
    expect(screen.getByText(/Grok Bot cheat sheet/)).toBeInTheDocument();
  });

  it("shows the stored preview as a card that opens the page", () => {
    renderCard({
      content,
      linkPreview: {
        url: LINK,
        title: "Grok Bot Cheatsheet",
        description: "One-page reference for small business users",
        imageUrl: "https://cdn.example.com/thumb.img",
        siteName: "Claude",
      },
    });
    const card = screen.getByRole("link", { name: /Grok Bot Cheatsheet/ });
    expect(card).toHaveAttribute("href", LINK);
    expect(card).toHaveAttribute("target", "_blank");
    expect(card).toHaveTextContent("claude.ai");
    expect(card).toHaveTextContent("One-page reference");
    expect(card.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example.com/thumb.img",
    );
  });

  it("falls back to the site and address when there is no preview", () => {
    renderCard({ content });
    const card = screen.getByRole("link", {
      name: /claude\.ai\/artifact\/QfGAfn6EPmuJngAgwsZoa9 \(opens/,
    });
    expect(card).toHaveAttribute("href", LINK);
    expect(card.querySelector("img")).toBeNull();
  });

  it("ignores a stored preview of a link the post no longer has", () => {
    renderCard({
      content,
      linkPreview: { url: "https://old.example.com/", title: "Old page" },
    });
    expect(screen.queryByText("Old page")).toBeNull();
  });

  it("hides the preview image when it fails to load", () => {
    renderCard({
      content,
      linkPreview: {
        url: LINK,
        title: "Grok Bot Cheatsheet",
        imageUrl: "https://cdn.example.com/broken.img",
      },
    });
    const card = screen.getByRole("link", { name: /Grok Bot Cheatsheet/ });
    fireEvent.error(card.querySelector("img")!);
    expect(card.querySelector("img")).toBeNull();
  });

  it("lets attached media take the place of the link card", () => {
    renderCard({ content, video });
    // Only the inline link in the text: no card.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.getByTestId("player")).toBeInTheDocument();
  });

  it("shows no card for a post without a link", () => {
    renderCard({ content: "Just words" });
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("FeedPostCard list updates", () => {
  it("hands a like and a delete to the list when it can apply them in place", () => {
    const onPostChange = vi.fn();
    const { onRefresh } = renderCard({}, { onPostChange });

    mutationOptions.toggleLike!.onSuccess!({ liked: true, likeCount: 3 });
    mutationOptions.deletePost!.onSuccess!(undefined);

    expect(onPostChange).toHaveBeenNthCalledWith(1, {
      kind: "liked",
      postId: 7,
      liked: true,
      likeCount: 3,
    });
    expect(onPostChange).toHaveBeenNthCalledWith(2, {
      kind: "deleted",
      postId: 7,
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("refetches the feed when the list has no in-place update", () => {
    const { onRefresh } = renderCard();
    mutationOptions.toggleLike!.onSuccess!({ liked: true, likeCount: 3 });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("FeedPostCard gallery post", () => {
  const LINK = "https://example.com/recap";
  const gallery = {
    batchId: 3,
    items: [
      {
        id: 9,
        mediaType: "photo" as const,
        url: "https://files.test/9.jpg",
        thumbnailUrl: "https://files.test/9-thumb.jpg",
        width: 1200,
        height: 800,
        durationSeconds: null,
        caption: "Demo time",
        alt: null,
        event: null,
        topicSlug: null,
        visibility: "public" as const,
        magazineConsent: false,
        uploader: { id: "author-1", name: "Ada", image: null },
        createdAt: "2026-09-24T10:00:00Z",
        isOwn: false,
        batchId: 3,
        hidden: false,
      },
    ],
    total: 1,
    event: null,
    topicSlug: null,
  };

  beforeEach(() => collageProps.mockClear());

  it("shows the batch as a collage in place of the link card", () => {
    const { onRefresh } = renderCard(
      { content: `Our evening ${LINK}`, isGalleryPost: true, gallery },
      { memberRole: "moderator" },
    );
    expect(screen.getByTestId("collage")).toBeInTheDocument();
    const props = collageProps.mock.calls.at(-1)![0] as {
      slug: string;
      gallery: unknown;
      memberRole: string;
      onChange: () => void;
    };
    expect(props).toMatchObject({
      slug: "town",
      gallery,
      memberRole: "moderator",
    });
    // Only the inline link in the text: no link card.
    expect(screen.getAllByRole("link")).toHaveLength(1);
    props.onChange();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("shows only the text when the viewer may see none of the batch", () => {
    renderCard({
      content: `Our evening ${LINK}`,
      isGalleryPost: true,
      gallery: null,
    });
    expect(screen.queryByTestId("collage")).toBeNull();
    expect(screen.getByText(/Our evening/)).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("says how many photos and videos the author added", () => {
    renderCard({ isGalleryPost: true, gallery });
    expect(
      screen.getByText("added one photo or video to the gallery"),
    ).toBeInTheDocument();
  });

  it("counts every item of the batch the viewer may see", () => {
    renderCard({ isGalleryPost: true, gallery: { ...gallery, total: 12 } });
    expect(
      screen.getByText("added 12 photos and videos to the gallery"),
    ).toBeInTheDocument();
  });

  it("says nothing about the batch when the viewer may see none of it", () => {
    renderCard({ isGalleryPost: true, gallery: null });
    expect(screen.queryByText(/to the gallery/)).toBeNull();
  });

  it("keeps focus in the card when a delete empties the collage", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    const card = (shown: typeof gallery | null) => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <FeedPostCard
          post={{ ...basePost, isGalleryPost: true, gallery: shown }}
          currentUserId="author-1"
          memberRole="member"
          communitySlug="town"
          onRefresh={onRefresh}
          onToggleComments={vi.fn()}
          showComments={false}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(card(gallery));
    screen.getByRole("button", { name: "Photo in collage" }).focus();
    const props = collageProps.mock.calls.at(-1)![0] as {
      onChange: () => void;
    };
    props.onChange();
    rerender(card(null));
    expect(screen.queryByTestId("collage")).toBeNull();
    expect(screen.getByRole("button", { name: "Post actions" })).toHaveFocus();
  });

  it("forgets an edit once the collage reloads, so a later empty collage moves no focus", () => {
    const card = (shown: typeof gallery | null) => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <FeedPostCard
          post={{ ...basePost, isGalleryPost: true, gallery: shown }}
          currentUserId="author-1"
          memberRole="member"
          communitySlug="town"
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onToggleComments={vi.fn()}
          showComments={false}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(card(gallery));
    const props = collageProps.mock.calls.at(-1)![0] as {
      onChange: () => void;
    };
    // An edit: the collage reloads with its items still there.
    props.onChange();
    rerender(
      card({
        ...gallery,
        items: [{ ...gallery.items[0]!, caption: "Edited caption" }],
      }),
    );
    // Later the collage goes for another reason, with focus elsewhere.
    rerender(card(null));
    expect(
      screen.getByRole("button", { name: "Post actions" }),
    ).not.toHaveFocus();
  });

  it("falls back to the card, with the design system's focus ring, when there is no menu", () => {
    const card = (shown: typeof gallery | null) => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <FeedPostCard
          post={{ ...basePost, isGalleryPost: true, gallery: shown }}
          currentUserId="viewer-1"
          memberRole="member"
          communitySlug="town"
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onToggleComments={vi.fn()}
          showComments={false}
        />
      </NextIntlClientProvider>
    );
    const { container, rerender } = render(card(gallery));
    expect(screen.queryByRole("button", { name: "Post actions" })).toBeNull();
    screen.getByRole("button", { name: "Photo in collage" }).focus();
    const props = collageProps.mock.calls.at(-1)![0] as {
      onChange: () => void;
    };
    props.onChange();
    rerender(card(null));
    const cardElement = container.firstElementChild as HTMLElement;
    expect(cardElement).toHaveFocus();
    expect(cardElement).toHaveAttribute("tabindex", "-1");
    expect(cardElement).toHaveClass(
      "outline-none",
      "focus-visible:border-ring",
      "focus-visible:ring-ring/50",
      "focus-visible:ring-[3px]",
    );
  });

  it("leaves focus alone when the collage goes for another reason", () => {
    const card = (shown: typeof gallery | null) => (
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <FeedPostCard
          post={{ ...basePost, isGalleryPost: true, gallery: shown }}
          currentUserId="author-1"
          memberRole="member"
          communitySlug="town"
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onToggleComments={vi.fn()}
          showComments={false}
        />
      </NextIntlClientProvider>
    );
    const { rerender } = render(card(gallery));
    rerender(card(null));
    expect(
      screen.getByRole("button", { name: "Post actions" }),
    ).not.toHaveFocus();
  });

  it("has no Public badge, even when its items are open to everyone", () => {
    renderCard({ isGalleryPost: true, gallery });
    expect(screen.queryByText("Public")).toBeNull();
  });
});
