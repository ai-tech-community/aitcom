import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { PostComposer } from "./post-composer";
import type { VideoPostState } from "./use-video-post";

const m = vi.hoisted(() => ({
  videosOn: true,
  videoState: { step: "idle" } as VideoPostState,
  post: vi.fn(),
  reset: vi.fn(),
  cancel: vi.fn(),
  createPost: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/lib/community-videos-flag", () => ({
  isCommunityVideosEnabled: () => m.videosOn,
}));

vi.mock("./use-video-post", () => ({
  useVideoPost: () => ({
    state: m.videoState,
    post: m.post,
    cancel: m.cancel,
    reset: m.reset,
  }),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: m.toastSuccess, error: vi.fn() },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({
      feed: {
        getFeed: { invalidate: vi.fn() },
        getActivity: { invalidate: vi.fn() },
      },
    }),
    topics: { list: { useQuery: () => ({ data: undefined }) } },
    feed: {
      createPost: {
        useMutation: () => ({ mutate: m.createPost, isPending: false }),
      },
    },
  },
}));

const clip = new File(["clip"], "holiday.mov", { type: "video/quicktime" });

function renderComposer() {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PostComposer slug="mlops" canPost />
    </NextIntlClientProvider>,
  );
  const inputs =
    view.container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const byAccept = (accept: string) =>
    [...inputs].find((input) => input.accept === accept)!;
  return {
    imageInput: () => byAccept("image/*"),
    videoInput: () => byAccept("video/*"),
  };
}

function pickVideo(input: HTMLInputElement) {
  fireEvent.change(input, { target: { files: [clip] } });
}

const postButton = () => screen.getByRole("button", { name: "Post" });

beforeEach(() => {
  m.videosOn = true;
  m.videoState = { step: "idle" };
  m.post.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PostComposer video", () => {
  it("hides Add video while the feature is off", () => {
    m.videosOn = false;
    renderComposer();
    expect(
      screen.queryByRole("button", { name: "Add video" }),
    ).not.toBeInTheDocument();
  });

  it("posts the picked clip with the caption, visibility and topic", async () => {
    const { videoInput } = renderComposer();
    pickVideo(videoInput());

    expect(screen.getByText("holiday.mov")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: en.communities.feed.addImage }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add video" }),
    ).not.toBeInTheDocument();
    expect(postButton()).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "  Our trip  " },
    });
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    fireEvent.click(postButton());

    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled());
    expect(m.post).toHaveBeenCalledWith({
      file: clip,
      caption: "Our trip",
      visibility: "public",
      topicSlug: "general",
    });
    expect(m.createPost).not.toHaveBeenCalled();
    expect(m.toastSuccess).toHaveBeenCalledWith(
      en.communities.feed.postCreated,
    );
    expect(screen.queryByText("holiday.mov")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("keeps the clip and caption when the video post fails", async () => {
    m.post.mockResolvedValue(false);
    const { videoInput } = renderComposer();
    pickVideo(videoInput());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Our trip" },
    });
    fireEvent.click(postButton());

    await waitFor(() => expect(m.post).toHaveBeenCalled());
    expect(m.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("holiday.mov")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("Our trip");
  });

  it("does not start a second post while one is on its way", () => {
    m.videoState = { step: "uploading", share: 0.3 };
    const { videoInput } = renderComposer();
    pickVideo(videoInput());
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Our trip" },
    });

    expect(postButton()).toBeDisabled();
    fireEvent.submit(postButton().closest("form")!);
    expect(m.post).not.toHaveBeenCalled();
  });

  it("brings Add image back after the clip is removed", () => {
    const { videoInput } = renderComposer();
    pickVideo(videoInput());
    fireEvent.click(screen.getByRole("button", { name: "Remove video" }));

    expect(
      screen.getByRole("button", { name: en.communities.feed.addImage }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Add video" })).toBeVisible();
  });

  it("hides Add video while an image is attached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ url: "https://cdn.test/a.png" }),
      }),
    );
    const { imageInput } = renderComposer();
    expect(screen.getByRole("button", { name: "Add video" })).toBeVisible();
    fireEvent.change(imageInput(), {
      target: { files: [new File(["img"], "a.png", { type: "image/png" })] },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: en.communities.feed.removeImage }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Add video" }),
    ).not.toBeInTheDocument();
  });
});
