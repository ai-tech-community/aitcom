import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
  editPost: vi.fn(),
  editPending: false,
  videoState: { step: "idle" } as { step: string },
  post: vi.fn(async () => true),
  check: vi.fn(async () => undefined),
  reset: vi.fn(),
  cancel: vi.fn(),
  upload: vi.fn(async () => "https://bucket.s3.test/new.jpg"),
  toast: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("sonner", () => ({ toast: { success: m.toast, error: m.toast } }));
vi.mock("@/trpc/react", () => ({
  api: {
    feed: {
      editPost: {
        useMutation: (opts: { onSuccess: () => void }) => ({
          mutate: (input: unknown) => {
            m.editPost(input);
            opts.onSuccess();
          },
          isPending: m.editPending,
        }),
      },
    },
  },
}));
vi.mock("./use-video-post", () => ({
  useVideoPost: () => ({
    state: m.videoState,
    post: m.post,
    check: m.check,
    reset: m.reset,
    cancel: m.cancel,
  }),
}));
vi.mock("./upload-feed-image", () => ({ uploadFeedImage: m.upload }));
vi.mock("./video-attachment", () => ({
  VideoAttachment: ({ file }: { file: File }) => (
    <div data-testid="new-video">{file.name}</div>
  ),
}));

import { PostEditForm, type EditablePost } from "./post-edit-form";

const textPost: EditablePost = {
  id: 5,
  content: "Hello",
  topicSlug: "general",
  visibility: "community",
};

function renderForm(post: EditablePost = textPost) {
  const onSaved = vi.fn();
  const view = render(
    <PostEditForm
      post={post}
      communitySlug="mlops"
      onSaved={onSaved}
      onCancel={vi.fn()}
    />,
  );
  return { ...view, onSaved };
}

function fileInput(container: HTMLElement, accept: string) {
  return container.querySelector<HTMLInputElement>(
    `input[type=file][accept="${accept}"]`,
  )!;
}

afterEach(() => vi.clearAllMocks());

describe("PostEditForm", () => {
  it("saves the text and keeps the media by default", () => {
    const { onSaved } = renderForm({
      ...textPost,
      imageUrl: "https://bucket.s3.test/old.jpg",
    });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Hello again" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith({
      postId: 5,
      communitySlug: "mlops",
      content: "Hello again",
      media: { kind: "keep" },
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("removes the image", () => {
    renderForm({ ...textPost, imageUrl: "https://bucket.s3.test/old.jpg" });
    expect(
      screen.getByRole("img", { name: "currentImage" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "removeImage" }));
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({ media: { kind: "none" } }),
    );
  });

  it("adds an image to a text post", async () => {
    const { container } = renderForm();
    expect(
      screen.getByRole("button", { name: "addImage" }),
    ).toBeInTheDocument();
    const picture = new File(["x"], "pic.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(fileInput(container, "image/*"), {
        target: { files: [picture] },
      });
    });
    expect(m.upload).toHaveBeenCalledWith(picture);
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        media: { kind: "image", url: "https://bucket.s3.test/new.jpg" },
      }),
    );
  });

  it("replaces the media with a video on the same post and audience", async () => {
    const { container, onSaved } = renderForm({
      ...textPost,
      visibility: "public",
      video: { thumbnailUrl: "https://cdn.test/old.jpg" },
    });
    expect(
      screen.getByRole("img", { name: "currentVideo" }),
    ).toBeInTheDocument();
    const clip = new File(["v"], "clip.mov", { type: "video/quicktime" });
    fireEvent.change(fileInput(container, "video/*"), {
      target: { files: [clip] },
    });
    expect(m.check).toHaveBeenCalledWith(clip);
    expect(screen.getByTestId("new-video")).toHaveTextContent("clip.mov");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.post).toHaveBeenCalledWith({
      file: clip,
      caption: "Hello",
      visibility: "public",
      topicSlug: "general",
      replacePostId: 5,
    });
    expect(m.editPost).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("warns that a public post without its video becomes members-only", () => {
    renderForm({
      ...textPost,
      visibility: "public",
      video: { thumbnailUrl: "https://cdn.test/old.jpg" },
    });
    expect(screen.queryByText("becomesMembersOnly")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    expect(screen.getByText("becomesMembersOnly")).toBeInTheDocument();
  });

  it("offers to replace when there is media, and to add when there is none", () => {
    renderForm({ ...textPost, imageUrl: "https://bucket.s3.test/old.jpg" });
    expect(
      screen.getByRole("button", { name: "replaceWithImage" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "replaceWithVideo" }),
    ).toBeInTheDocument();
  });

  it("does not save while the video is still working", () => {
    m.videoState = { step: "uploading" };
    try {
      renderForm();
      expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
    } finally {
      m.videoState = { step: "idle" };
    }
  });
});
