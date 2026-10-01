import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import en from "../../../../messages/en.json";
import { PostComposer } from "./post-composer";
import type { VideoPostState } from "./use-video-post";

const m = vi.hoisted(() => ({
  mentionCandidates: vi.fn((_input: unknown, _opts: unknown) => ({
    data: [] as { userId: string; name: string; image: string | null }[],
    isFetched: true,
    isError: false,
  })),
  videoState: { step: "idle" } as VideoPostState,
  post: vi.fn(),
  reset: vi.fn(),
  check: vi.fn(),
  cancel: vi.fn(),
  createPost: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
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

vi.mock("./use-video-post", () => ({
  useVideoPost: () => ({
    state: m.videoState,
    post: m.post,
    cancel: m.cancel,
    reset: m.reset,
    check: m.check,
  }),
}));

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}));

vi.mock("sonner", () => ({
  toast: Object.assign(m.toastInfo, {
    success: m.toastSuccess,
    error: m.toastError,
  }),
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
      mentionCandidates: {
        useQuery: (input: { query: string }, opts: { enabled: boolean }) =>
          m.mentionCandidates(input, opts),
      },
      createPost: {
        useMutation: () => ({ mutate: m.createPost, isPending: false }),
      },
    },
  },
}));

const clip = new File(["clip"], "holiday.mov", { type: "video/quicktime" });

function renderComposer({ canAnnounce = false } = {}) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PostComposer
        slug="mlops"
        userId="u1"
        canPost
        canAnnounce={canAnnounce}
      />
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
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  m.videoState = { step: "idle" };
  m.post.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PostComposer video", () => {
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
    // A video needs a few words (it has no other text alternative yet).
    expect(postButton()).toBeDisabled();
    expect(
      screen.getByText("Add a few words about the video."),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      {
        target: { value: "  Our trip  " },
      },
    );
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    fireEvent.click(postButton());

    await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled());
    expect(m.post).toHaveBeenCalledWith({
      file: clip,
      caption: "Our trip",
      mentions: [],
      visibility: "public",
      topicSlug: "general",
    });
    expect(m.createPost).not.toHaveBeenCalled();
    expect(m.toastSuccess).toHaveBeenCalledWith(
      en.communities.feed.postCreated,
    );
    expect(screen.queryByText("holiday.mov")).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
    ).toHaveValue("");
  });

  it("keeps the clip and caption when the video post fails", async () => {
    m.post.mockResolvedValue(false);
    const { videoInput } = renderComposer();
    pickVideo(videoInput());
    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      {
        target: { value: "Our trip" },
      },
    );
    fireEvent.click(postButton());

    await waitFor(() => expect(m.post).toHaveBeenCalled());
    expect(m.toastSuccess).not.toHaveBeenCalled();
    expect(screen.getByText("holiday.mov")).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
    ).toHaveValue("Our trip");
  });

  it("tries the same post again from the error", async () => {
    m.post.mockResolvedValue(false);
    const { videoInput } = renderComposer();
    pickVideo(videoInput());
    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      {
        target: { value: "Our trip" },
      },
    );
    fireEvent.click(screen.getByRole("radio", { name: /Public/ }));
    fireEvent.click(postButton());
    await waitFor(() => expect(m.post).toHaveBeenCalledTimes(1));

    m.videoState = {
      step: "error",
      message: en.communities.video.failed,
      retryable: true,
    };
    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      {
        target: { value: "Our trip " },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(m.post).toHaveBeenCalledTimes(2));
    expect(m.post).toHaveBeenLastCalledWith({
      file: clip,
      caption: "Our trip",
      mentions: [],
      visibility: "public",
      topicSlug: "general",
    });
  });

  it("checks a clip as soon as it is picked", () => {
    const { videoInput } = renderComposer();
    pickVideo(videoInput());
    expect(m.reset).toHaveBeenCalled();
    expect(m.check).toHaveBeenCalledWith(clip);
  });

  it("does not start a second post while one is on its way", () => {
    m.videoState = { step: "uploading", share: 0.3 };
    const { videoInput } = renderComposer();
    pickVideo(videoInput());
    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      {
        target: { value: "Our trip" },
      },
    );

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
        screen.getByRole("button", { name: "Remove picture 1" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: "Add video" }),
    ).not.toBeInTheDocument();
  });
});

describe("PostComposer pictures", () => {
  it("does not post while a picture is still uploading, even with Ctrl+Enter", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const { imageInput } = renderComposer();
    fireEvent.change(imageInput(), {
      target: { files: [new File(["x"], "pic.png", { type: "image/png" })] },
    });
    const field = screen.getByRole("textbox", {
      name: en.communities.feed.composePlaceholder,
    });
    fireEvent.change(field, { target: { value: "Look at this" } });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(m.createPost).not.toHaveBeenCalled();
    expect(postButton()).toBeDisabled();
  });

  it("posts a picked GIF by its GIPHY id, and a GIF hides Add video", () => {
    renderComposer();
    fireEvent.click(
      screen.getByRole("button", { name: en.communities.feed.editor.gif }),
    );
    expect(
      screen.getByRole("img", { name: "Party parrot" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: en.communities.video.add }),
    ).not.toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      {
        target: { value: "Weekend!" },
      },
    );
    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ gifId: "abc123", images: undefined }),
    );
  });

  it("posts several pictures in order, with their descriptions", async () => {
    let next = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        next += 1;
        const id = next;
        return {
          ok: true,
          json: () =>
            Promise.resolve({ id, url: `https://cdn.test/${id}.png` }),
        };
      }),
    );
    const { imageInput } = renderComposer();
    fireEvent.change(imageInput(), {
      target: {
        files: [
          new File(["a"], "a.png", { type: "image/png" }),
          new File(["b"], "b.png", { type: "image/png" }),
        ],
      },
    });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Post" })).toBeDisabled(),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Description of picture 1" }),
      { target: { value: "Our new office" } },
    );
    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      { target: { value: "Moved in!" } },
    );
    await waitFor(() => expect(postButton()).toBeEnabled());
    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          { id: 1, alt: "Our new office" },
          { id: 2, alt: "" },
        ],
      }),
    );
  });

  it("keeps at most four pictures and says so", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const { imageInput } = renderComposer();
    fireEvent.change(imageInput(), {
      target: {
        files: [1, 2, 3, 4, 5].map(
          (n) => new File([String(n)], `${n}.png`, { type: "image/png" }),
        ),
      },
    });
    expect(
      screen.getAllByRole("button", { name: /Remove picture/ }),
    ).toHaveLength(4);
    expect(m.toastError).toHaveBeenCalledWith(
      en.communities.feed.editor.tooManyPictures,
    );
  });

  it("keeps a picture that did not upload, blocks posting, and retries it", async () => {
    let attempt = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempt += 1;
        return attempt === 1
          ? { ok: false, json: async () => ({}) }
          : {
              ok: true,
              json: async () => ({ id: 9, url: "https://cdn.test/9.png" }),
            };
      }),
    );
    const { imageInput } = renderComposer();
    fireEvent.change(imageInput(), {
      target: { files: [new File(["a"], "a.png", { type: "image/png" })] },
    });
    fireEvent.change(
      screen.getByRole("textbox", {
        name: en.communities.feed.composePlaceholder,
      }),
      { target: { value: "Look" } },
    );
    await waitFor(() =>
      expect(
        screen.getByText(en.communities.feed.editor.pictureFailed),
      ).toBeVisible(),
    );
    expect(postButton()).toBeDisabled();
    expect(
      screen.getByText(en.communities.feed.editor.fixPictures),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Try picture 1 again" }),
    );
    await waitFor(() => expect(postButton()).toBeEnabled());
    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ images: [{ id: 9, alt: "" }] }),
    );
  });

  it("offers to undo when a GIF replaces the pictures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => undefined)),
    );
    const { imageInput } = renderComposer();
    fireEvent.change(imageInput(), {
      target: { files: [new File(["a"], "a.png", { type: "image/png" })] },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: en.communities.feed.editor.replacePicturesWithGif,
      }),
    );
    expect(
      screen.queryByRole("button", { name: "Remove picture 1" }),
    ).toBeNull();
    const [message, options] = m.toastInfo.mock.calls[0] as unknown as [
      string,
      { action: { onClick: () => void } },
    ];
    expect(message).toBe(en.communities.feed.editor.picturesReplacedByGif);
    act(() => options.action.onClick());
    expect(
      screen.getByRole("button", { name: "Remove picture 1" }),
    ).toBeVisible();
  });
});

describe("PostComposer mentions", () => {
  const members = [
    { userId: "u-jane", name: "Jane Doe", image: null },
    { userId: "u-joe", name: "Joe", image: null },
  ];
  beforeEach(() => {
    m.mentionCandidates.mockImplementation(() => ({
      data: members,
      isFetched: true,
      isError: false,
    }));
  });

  it("offers members after @, writes the picked one and posts whom it mentions", () => {
    renderComposer();
    const box = screen.getByRole("textbox");
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.change(box, { target: { value: "Thanks @J" } });
    const list = screen.getByRole("listbox", { name: "Members to mention" });
    const options = within(list).getAllByRole("option");
    // The text area keeps the focus and points at the active member.
    expect(box).toHaveAttribute("aria-controls", list.id);
    expect(box).toHaveAttribute("aria-activedescendant", options[0]!.id);
    expect(m.mentionCandidates).toHaveBeenLastCalledWith(
      expect.objectContaining({ communitySlug: "mlops" }),
      expect.objectContaining({ enabled: true }),
    );

    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(options[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(box, { key: "Enter" });

    expect(box).toHaveValue("Thanks @Jane Doe ");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(box).not.toHaveAttribute("aria-activedescendant");

    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Thanks @Jane Doe",
        mentions: ["u-jane"],
      }),
    );
  });

  it("picks with a click, and leaves out a mention whose name was deleted", () => {
    renderComposer();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "@" } });
    fireEvent.click(screen.getByRole("option", { name: "Joe" }));
    expect(box).toHaveValue("@Joe ");

    fireEvent.change(box, { target: { value: "Never mind" } });
    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Never mind", mentions: [] }),
    );
  });

  it("closes the list with Escape until a new @, and says when no one matches", async () => {
    renderComposer();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "Hi @Jo" } });
    expect(screen.getByRole("listbox")).toBeVisible();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(box, { target: { value: "Hi @Joe" } });
    expect(screen.queryByRole("listbox")).toBeNull();

    m.mentionCandidates.mockImplementation(() => ({
      data: [],
      isFetched: true,
      isError: false,
    }));
    fireEvent.change(box, { target: { value: "Hi @Joe and @Zed" } });
    expect(
      (await screen.findAllByText("No members named “Zed”."))[0],
    ).toBeVisible();
    expect(screen.queryByRole("listbox")).toBeNull();
    // Words after an "@" that match no one: no list, no message.
    fireEvent.change(box, { target: { value: "Hi @Joe and @Zed is here" } });
    await waitFor(() =>
      expect(screen.queryAllByText(/No members named/)).toHaveLength(0),
    );
  });

  it("never offers a member the typed name no longer matches", () => {
    renderComposer();
    const box = screen.getByRole("textbox");
    // The results for "J" are still on screen while "Jane can" loads.
    fireEvent.change(box, { target: { value: "@Jane can" } });
    expect(screen.queryByRole("option")).toBeNull();
    const enter = fireEvent.keyDown(box, { key: "Enter" });
    // Not taken by the list: Enter stays a new line.
    expect(enter).toBe(true);
    expect(box).toHaveValue("@Jane can");
  });

  it("names the highlighted member for screen readers", () => {
    renderComposer();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "@" } });
    expect(
      screen.getByText(
        "2 members found. Arrow keys to choose, Enter or Tab to pick, Escape to close.",
      ),
    ).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getByText("Joe, 2 of 2")).toBeInTheDocument();
  });

  it("offers @everyone for @all, and writes it without a member behind it", () => {
    m.mentionCandidates.mockImplementation(() => ({
      data: [
        ...members,
        { userId: "everyone", name: "everyone", image: null, everyone: true },
      ],
      isFetched: true,
      isError: false,
    }));
    renderComposer();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "News @al" } });
    const option = screen.getByRole("option", { name: /@everyone/ });
    expect(option).toHaveTextContent("Notify the whole community");
    // Members whose name doesn't hold "al" are not offered.
    expect(screen.getAllByRole("option")).toHaveLength(1);
    // A quick Enter never reaches the whole community: it stays a key.
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(true);
    expect(box).toHaveValue("News @al");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(
      screen.getByText("@everyone, Notify the whole community, 1 of 1"),
    ).toBeInTheDocument();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box).toHaveValue("News @everyone ");
    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ content: "News @everyone", mentions: [] }),
    );
  });

  it("warns an owner that @everyone notifies the whole community", () => {
    renderComposer({ canAnnounce: true });
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Big news @everyone" },
    });
    expect(
      screen.getByText(/This post will notify everyone in the community/),
    ).toBeInTheDocument();
  });

  it("types an @ from the toolbar button", () => {
    renderComposer();
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Mention a member" }));
    expect(box).toHaveValue("Hello @");
  });
});

describe("PostComposer polls", () => {
  it("adds a poll, posts it only once the question and answers are in", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Add poll" }));
    const first = screen.getByRole("textbox", { name: "Answer 1" });
    await waitFor(() => expect(first).toHaveFocus());
    // One kind of media at a time.
    expect(screen.queryByRole("button", { name: "Add video" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add GIF" })).toBeNull();

    const question = screen.getByRole("textbox", { name: "Ask a question…" });
    fireEvent.change(question, { target: { value: "Pizza or tacos?" } });
    fireEvent.change(first, { target: { value: "Pizza" } });
    expect(postButton()).toBeDisabled();
    expect(
      screen.getByText("Fill in every answer, or remove the empty one."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Answer 2" }), {
      target: { value: "pizza " },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Two answers are the same.",
    );
    expect(postButton()).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "Answer 2" }), {
      target: { value: "Tacos" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add answer" }));
    const third = screen.getByRole("textbox", { name: "Answer 3" });
    await waitFor(() => expect(third).toHaveFocus());
    fireEvent.change(third, { target: { value: "Both " } });
    fireEvent.change(screen.getByRole("combobox", { name: "Closes in" }), {
      target: { value: "7" },
    });
    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Pizza or tacos?",
        poll: { options: ["Pizza", "Tacos", "Both"], days: 7 },
        images: undefined,
        gifId: undefined,
      }),
    );
  });

  it("takes the poll off and puts focus back on Add poll", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "Add poll" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove poll" }));
    expect(screen.queryByRole("textbox", { name: "Answer 1" })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add poll" })).toHaveFocus(),
    );
  });
});

describe("PostComposer posts without words", () => {
  it("posts pictures without words only once each has a description", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: () => Promise.resolve({ id: 1, url: "https://cdn.test/1.png" }),
      })),
    );
    const { imageInput } = renderComposer();
    fireEvent.change(imageInput(), {
      target: { files: [new File(["x"], "a.png", { type: "image/png" })] },
    });
    expect(postButton()).toBeDisabled();
    expect(
      screen.getByText(/No words\? Describe each picture/),
    ).toBeInTheDocument();
    const alt = screen.getByRole("textbox", {
      name: "Description of picture 1",
    });
    expect(alt).toHaveAttribute("aria-required", "true");
    fireEvent.change(alt, { target: { value: "Our team at the meetup" } });
    await waitFor(() => expect(postButton()).toBeEnabled());
  });

  it("posts a GIF on its own, but not an empty post or a poll without a question", () => {
    renderComposer();
    // Nothing yet: nothing to post.
    expect(postButton()).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Add poll" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Answer 1" }), {
      target: { value: "Yes" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Answer 2" }), {
      target: { value: "No" },
    });
    // A poll's words are its question.
    expect(postButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove poll" }));

    fireEvent.click(screen.getByRole("button", { name: "Add GIF" }));
    expect(postButton()).toBeEnabled();
    fireEvent.click(postButton());
    expect(m.createPost).toHaveBeenCalledWith(
      expect.objectContaining({ content: "", gifId: "abc123" }),
    );
  });
});
