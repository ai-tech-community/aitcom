import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
  editPost: vi.fn(),
  editPending: false,
  reels: vi.fn(),
  videoState: { step: "idle" } as
    | { step: string }
    | { step: "error"; message: string; retryable: boolean },
  post: vi.fn(async () => true),
  check: vi.fn(async () => undefined),
  reset: vi.fn(),
  cancel: vi.fn(),
  upload: vi.fn(async () => "https://bucket.s3.test/new.jpg"),
  toast: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: m.toast, error: m.toast } }));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ feed: { getReels: { invalidate: m.reels } } }),
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
  visibility: "community",
};
const imagePost = { ...textPost, imageUrl: "https://bucket.s3.test/old.jpg" };
const publicVideoPost: EditablePost = {
  ...textPost,
  visibility: "public",
  video: { thumbnailUrl: "https://cdn.test/old.jpg" },
};

function renderForm(post: EditablePost = textPost) {
  const onSaved = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <PostEditForm
      post={post}
      userId="u1"
      communitySlug="mlops"
      onSaved={onSaved}
      onCancel={onCancel}
    />,
  );
  return { ...view, onSaved, onCancel };
}

function fileInput(container: HTMLElement, accept: string) {
  const input = container.querySelector<HTMLInputElement>(
    `input[type=file][accept="${accept}"]`,
  );
  if (!input) throw new Error(`no ${accept} input`);
  return input;
}

function pick(container: HTMLElement, accept: string, file: File) {
  fireEvent.change(fileInput(container, accept), { target: { files: [file] } });
}

const picture = new File(["x"], "pic.png", { type: "image/png" });

beforeEach(() => {
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  vi.clearAllMocks();
  m.videoState = { step: "idle" };
});

describe("PostEditForm", () => {
  it("saves the text and keeps the media by default", () => {
    const { onSaved } = renderForm(imagePost);
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
    expect(m.reels).toHaveBeenCalledWith({ communitySlug: "mlops" });
    expect(onSaved).toHaveBeenCalled();
  });

  it("removes the image and keeps keyboard focus in the form", () => {
    renderForm(imagePost);
    expect(screen.getByRole("img", { name: "currentImage" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "removeImage" }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("button", { name: "addImage" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({ media: { kind: "none" } }),
    );
  });

  it("uploads a picked image only on Save", async () => {
    const { container } = renderForm();
    pick(container, "image/*", picture);
    expect(screen.getByRole("img", { name: "attachedImage" })).toHaveAttribute(
      "src",
      "blob:preview",
    );
    expect(m.upload).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.upload).toHaveBeenCalledWith(picture);
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        media: { kind: "image", url: "https://bucket.s3.test/new.jpg" },
      }),
    );
  });

  it("leaves nothing uploaded when the member picks an image and cancels", () => {
    const { container, onCancel } = renderForm();
    pick(container, "image/*", picture);
    fireEvent.click(screen.getByRole("button", { name: "discardChanges" }));
    expect(onCancel).toHaveBeenCalled();
    expect(m.upload).not.toHaveBeenCalled();
  });

  it("does not save the post when the image upload fails", async () => {
    m.upload.mockRejectedValueOnce(new Error("nope"));
    const { container, onSaved } = renderForm();
    pick(container, "image/*", picture);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.toast).toHaveBeenCalledWith("uploadFailed");
    expect(m.editPost).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("replaces the media with a video on the same post and audience", async () => {
    const { container, onSaved } = renderForm(publicVideoPost);
    const clip = new File(["v"], "clip.mov", { type: "video/quicktime" });
    pick(container, "video/*", clip);
    expect(m.check).toHaveBeenCalledWith(clip);
    expect(screen.getByTestId("new-video")).toHaveTextContent("clip.mov");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.post).toHaveBeenCalledWith({
      file: clip,
      caption: "Hello",
      visibility: "public",
      replacePostId: 5,
    });
    expect(m.editPost).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalled();
  });

  it("warns, in a live region already on the page, that a public post without its video becomes community-only", () => {
    renderForm(publicVideoPost);
    const regions = screen.getAllByRole("status");
    expect(screen.queryByText("becomesMembersOnly")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    const warning = screen.getByText("becomesMembersOnly");
    expect(regions.some((region) => region.contains(warning))).toBe(true);
  });

  it("brings the current media back without losing the text", () => {
    renderForm(publicVideoPost);
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Edited" },
    });
    fireEvent.click(screen.getByRole("button", { name: "remove" }));
    fireEvent.click(screen.getByRole("button", { name: "keepCurrentVideo" }));
    expect(screen.getByText("currentVideo")).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveValue("Edited");
    expect(
      screen.queryByRole("button", { name: "keepCurrentVideo" }),
    ).toBeNull();
  });

  it("offers to replace when there is media, and to add when there is none", () => {
    renderForm(imagePost);
    expect(
      screen.getByRole("button", { name: "replaceWithImage" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "replaceWithVideo" }),
    ).toBeVisible();
  });

  it("keeps a reported post's media as it is", () => {
    renderForm({ ...imagePost, hiddenAt: "2026-09-24T11:00:00Z" });
    expect(screen.getByText("mediaLockedWhileReviewed")).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "replaceWithImage" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "removeImage" })).toBeNull();
  });

  it("does not save while the video is still working", () => {
    m.videoState = { step: "uploading" };
    renderForm();
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("does not offer Save for a clip that cannot work", () => {
    m.videoState = { step: "error", message: "too long", retryable: false };
    const { container } = renderForm();
    pick(container, "video/*", new File(["v"], "long.mov"));
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
  });

  it("cancels with Escape", () => {
    const { onCancel } = renderForm();
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalled();
    expect(m.cancel).toHaveBeenCalled();
  });

  it("ignores an Escape that a popover in a portal already handled", () => {
    const { onCancel } = renderForm();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.keyDown(outside, { key: "Escape" });
    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    escape.preventDefault();
    screen.getByRole("textbox").dispatchEvent(escape);
    expect(onCancel).not.toHaveBeenCalled();
    outside.remove();
  });
});
