import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const m = vi.hoisted(() => ({
  mentionCandidates: vi.fn((_input: unknown, _opts: unknown) => ({
    data: [] as { userId: string; name: string; image: string | null }[],
    isFetched: true,
    isError: false,
  })),
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
  upload: vi.fn(async () => ({
    id: 42,
    url: "https://bucket.s3.test/new.jpg",
  })),
  toast: vi.fn(),
}));

const pickedGif = vi.hoisted(() => ({
  giphyId: "abc123",
  title: "Party parrot",
  mp4Url: "https://media.giphy.com/media/abc123/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/abc123/giphy_s.gif",
  width: 400,
  height: 300,
  preview: {
    mp4Url: "https://media.giphy.com/media/abc123/200w.mp4",
    stillUrl: "https://media.giphy.com/media/abc123/200w_s.gif",
    width: 200,
    height: 150,
  },
}));
vi.mock("./editor/gif-picker-button", () => ({
  GifPickerButton: ({
    label,
    onPick,
  }: {
    label: string;
    onPick: (gif: typeof pickedGif) => void;
  }) => (
    <button type="button" onClick={() => onPick(pickedGif)}>
      {label}
    </button>
  ),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("sonner", () => ({ toast: { success: m.toast, error: m.toast } }));
vi.mock("@/trpc/react", () => ({
  api: {
    useUtils: () => ({ feed: { getReels: { invalidate: m.reels } } }),
    topics: {
      list: {
        useQuery: () => ({
          data: [
            { id: 1, slug: "general", label: "General", emoji: null },
            { id: 2, slug: "jobs", label: "Jobs", emoji: null },
          ],
        }),
      },
    },
    feed: {
      mentionCandidates: {
        useQuery: (input: { query: string }, opts: { enabled: boolean }) =>
          m.mentionCandidates(input, opts),
      },
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
vi.mock("./upload-feed-image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./upload-feed-image")>()),
  uploadFeedImage: m.upload,
}));
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
const picturesPost: EditablePost = {
  ...textPost,
  imageUrl: "https://bucket.s3.test/11.jpg",
  images: [
    { id: 11, url: "https://bucket.s3.test/11.jpg", alt: "Desk" },
    { id: 12, url: "https://bucket.s3.test/12.jpg", alt: "" },
  ],
};
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
      mentions: [],
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

  it("uploads a picked picture only on Save", async () => {
    const { container } = renderForm();
    pick(container, "image/*", picture);
    expect(container.querySelector('img[src="blob:preview"]')).not.toBeNull();
    expect(m.upload).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.upload).toHaveBeenCalledWith(picture);
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        media: { kind: "images", images: [{ id: 42, alt: "" }] },
      }),
    );
  });

  it("keeps the other pictures when one is removed, with edited descriptions", async () => {
    const { container } = renderForm(picturesPost);
    expect(
      screen.getAllByRole("button", { name: "removePicture" }),
    ).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole("button", { name: "removePicture" })[0]!,
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "describePictureLabel" }),
      { target: { value: "  The whole team  " } },
    );
    pick(container, "image/*", picture);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.upload).toHaveBeenCalledTimes(1);
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        media: {
          kind: "images",
          images: [
            { id: 12, alt: "The whole team" },
            { id: 42, alt: "" },
          ],
        },
      }),
    );
  });

  it("takes no more than four pictures", () => {
    const { container } = renderForm(picturesPost);
    fireEvent.change(fileInput(container, "image/*"), {
      target: { files: [picture, picture, picture] },
    });
    expect(
      screen.getAllByRole("button", { name: "removePicture" }),
    ).toHaveLength(4);
    expect(m.toast).toHaveBeenCalledWith("tooManyPictures");
    expect(
      screen.getByRole("button", { name: "tooManyPictures" }),
    ).toBeDisabled();
  });

  it("removing every picture leaves the post without media", async () => {
    renderForm(picturesPost);
    for (const button of screen.getAllByRole("button", {
      name: "removePicture",
    })) {
      fireEvent.click(button);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({ media: { kind: "none" } }),
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
    expect(m.toast).toHaveBeenCalledWith("pictureFailed");
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
      mentions: [],
      visibility: "public",
      replacePostId: 5,
      details: {},
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

  it("keeps the post's mentions, and Escape closes the member list before the form", () => {
    m.mentionCandidates.mockImplementation(() => ({
      data: [{ userId: "u-joe", name: "Joe", image: null }],
      isFetched: true,
      isError: false,
    }));
    const { onCancel } = renderForm({
      ...textPost,
      content: "Hi @Jane Doe",
      mentions: [{ userId: "u-jane", name: "Jane Doe" }],
    });
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "Hi @Jane Doe and @J" } });
    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();

    // A new "@" opens it again.
    fireEvent.change(box, { target: { value: "Hi @Jane Doe and @" } });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(box, { target: { value: "Hi @Jane Doe, @" } });
    fireEvent.keyDown(box, { key: "Tab" });
    expect(box).toHaveValue("Hi @Jane Doe, @Joe ");
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({ mentions: ["u-jane", "u-joe"] }),
    );
    m.mentionCandidates.mockImplementation(() => ({
      data: [],
      isFetched: true,
      isError: false,
    }));
  });

  it("does not offer members with the caret right after a finished mention", () => {
    m.mentionCandidates.mockImplementation(() => ({
      data: [{ userId: "u-jane", name: "Jane Doe", image: null }],
      isFetched: true,
      isError: false,
    }));
    renderForm({
      ...textPost,
      content: "Hi @Jane Doe",
      mentions: [{ userId: "u-jane", name: "Jane Doe" }],
    });
    const box = screen.getByRole<HTMLTextAreaElement>("textbox");
    box.setSelectionRange(12, 12);
    fireEvent.select(box);
    expect(screen.queryByRole("listbox")).toBeNull();
    // Inside the name it is a search again.
    box.setSelectionRange(8, 8);
    fireEvent.select(box);
    expect(screen.getByRole("option", { name: "Jane Doe" })).toBeVisible();
    m.mentionCandidates.mockImplementation(() => ({
      data: [],
      isFetched: true,
      isError: false,
    }));
  });

  it("keeps a voted poll's answers, and warns that removing it removes its votes", () => {
    const { container } = renderForm({
      ...textPost,
      poll: {
        options: [
          { id: "a", label: "Pizza", votes: 2 },
          { id: "b", label: "Tacos", votes: 0 },
        ],
        totalVotes: 2,
        closesAt: new Date(Date.now() + 86_400_000).toISOString(),
        closed: false,
        myVote: null,
      },
    });
    expect(container).toHaveTextContent("Pizza");
    expect(screen.getByText("pollVotedKeep")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "changePollAnswers" }),
    ).toBeNull();
    // No new poll over one with votes.
    expect(
      screen.queryByRole("button", { name: "replaceWithPoll" }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "removePoll" }));
    expect(screen.getByText("pollVotesRemoved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({ media: { kind: "none" } }),
    );
  });

  it("changes a poll's answers while no one has voted", () => {
    renderForm({
      ...textPost,
      poll: {
        options: [
          { id: "a", label: "Pizza", votes: 0 },
          { id: "b", label: "Tacos", votes: 0 },
        ],
        totalVotes: 0,
        closesAt: new Date(Date.now() + 86_400_000).toISOString(),
        closed: false,
        myVote: null,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "changePollAnswers" }));
    const answers = screen.getAllByRole("textbox", { name: "pollAnswerLabel" });
    fireEvent.change(answers[1]!, { target: { value: "Sushi" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        media: {
          kind: "poll",
          poll: { options: ["Pizza", "Sushi"], days: 3 },
        },
      }),
    );
  });

  it("adds a poll to a post without media", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "addPoll" }));
    const answers = screen.getAllByRole("textbox", { name: "pollAnswerLabel" });
    fireEvent.change(answers[0]!, { target: { value: "Yes" } });
    expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
    fireEvent.change(answers[1]!, { target: { value: "No" } });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        media: { kind: "poll", poll: { options: ["Yes", "No"], days: 3 } },
      }),
    );
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

  it("puts a picked GIF on the post, and a public video post would lose public", () => {
    renderForm(publicVideoPost);
    fireEvent.click(screen.getByRole("button", { name: "replaceWithGif" }));
    expect(screen.getByText("becomesMembersOnly")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({ media: { kind: "gif", giphyId: "abc123" } }),
    );
  });

  it("shows the post's current GIF and keeps it by default", () => {
    renderForm({ ...textPost, gif: pickedGif });
    expect(screen.getByText("currentGif")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "removeGif" }));
    expect(
      screen.getByRole("button", { name: "keepCurrentGif" }),
    ).toBeInTheDocument();
  });

  it("keeps pictures that uploaded when a later one fails, and does not upload them again", async () => {
    const second = new File(["y"], "b.png", { type: "image/png" });
    m.upload
      .mockResolvedValueOnce({ id: 51, url: "https://bucket.s3.test/51.jpg" })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ id: 52, url: "https://bucket.s3.test/52.jpg" });
    const { container } = renderForm();
    fireEvent.change(fileInput(container, "image/*"), {
      target: { files: [picture, second] },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.editPost).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.upload).toHaveBeenCalledTimes(3);
    expect(m.editPost).toHaveBeenCalledWith(
      expect.objectContaining({
        media: {
          kind: "images",
          images: [
            { id: 51, alt: "" },
            { id: 52, alt: "" },
          ],
        },
      }),
    );
  });

  it("moves the post to another topic, sending only what changed", () => {
    renderForm({ ...textPost, topicSlug: "general" });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ topicSlug: expect.anything() }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "selectTopic" }), {
      target: { value: "jobs" },
    });
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenLastCalledWith(
      expect.objectContaining({ topicSlug: "jobs" }),
    );
  });

  it("takes a wrong link preview off the post, and can put it back", () => {
    const linked: EditablePost = {
      ...textPost,
      content: "Read https://example.com/post",
      linkPreview: {
        url: "https://example.com/post",
        title: "Not what I meant",
        hidden: false,
      },
    };
    renderForm(linked);
    expect(screen.getByText("Not what I meant")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "removePreview" }));
    expect(screen.getByText("previewHidden")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "save" }));
    expect(m.editPost).toHaveBeenLastCalledWith(
      expect.objectContaining({ linkPreviewHidden: true }),
    );
  });

  it("makes the selection bold from the toolbar", async () => {
    renderForm({ ...textPost, content: "Hello world" });
    const field = screen.getByRole("textbox", { name: "editLabel" });
    (field as HTMLTextAreaElement).setSelectionRange(6, 11);
    fireEvent.click(screen.getByRole("button", { name: "bold" }));
    expect(field).toHaveValue("Hello **world**");
  });

  it("replaces a video and moves the post in one save", async () => {
    const { container } = renderForm({
      ...publicVideoPost,
      topicSlug: "general",
    });
    fireEvent.change(screen.getByRole("combobox", { name: "selectTopic" }), {
      target: { value: "jobs" },
    });
    pick(container, "video/*", new File(["v"], "clip.mov"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "save" }));
    });
    expect(m.post).toHaveBeenCalledWith(
      expect.objectContaining({ details: { topicSlug: "jobs" } }),
    );
    expect(m.editPost).not.toHaveBeenCalled();
  });

  it("offers to hide a preview only while the text still leads with its link, and the post has no media", () => {
    const linked: EditablePost = {
      ...textPost,
      content: "Read https://example.com/post",
      linkPreview: { url: "https://example.com/post", title: "A page" },
    };
    const { unmount } = renderForm(linked);
    expect(screen.getByRole("button", { name: "removePreview" })).toBeVisible();
    fireEvent.change(screen.getByRole("textbox", { name: "editLabel" }), {
      target: { value: "Read https://example.com/other" },
    });
    expect(screen.queryByRole("button", { name: "removePreview" })).toBeNull();
    unmount();
    renderForm({ ...linked, imageUrl: "https://bucket.s3.test/a.jpg" });
    expect(screen.queryByRole("button", { name: "removePreview" })).toBeNull();
  });
});
