import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { TRPCClientError } from "@trpc/client";

const send = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock("sonner", () => ({ toast }));
vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("./use-send-message", () => ({
  useSendMessage: () => ({ send, isPending: false }),
}));
vi.mock("@/components/composer/emoji-picker-button", () => ({
  EmojiPickerButton: ({ onPick }: { onPick: (emoji: string) => void }) => (
    <button type="button" onClick={() => onPick("🎉")}>
      emoji
    </button>
  ),
}));

const partyGif = vi.hoisted(() => ({
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
const catGif = vi.hoisted(() => ({
  giphyId: "def456",
  title: "Keyboard cat",
  mp4Url: "https://media.giphy.com/media/def456/giphy.mp4",
  stillUrl: "https://media.giphy.com/media/def456/giphy_s.gif",
  width: 480,
  height: 360,
  preview: {
    mp4Url: "https://media.giphy.com/media/def456/200w.mp4",
    stillUrl: "https://media.giphy.com/media/def456/200w_s.gif",
    width: 200,
    height: 150,
  },
}));
/** The GIF the mocked picker hands over on its next click. */
const nextPick = vi.hoisted(() => ({ gif: null as PickedGif | null }));
vi.mock("@/components/composer/gif-picker-button", () => ({
  // Like the real button: its search field lives in a panel portalled
  // out of the composer's form.
  GifPickerButton: ({
    ref,
    onPick,
  }: {
    ref?: React.Ref<HTMLButtonElement>;
    onPick: (gif: PickedGif) => void;
  }) => (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => onPick(nextPick.gif ?? partyGif)}
      >
        gif
      </button>
      {createPortal(<input aria-label="gif search" />, document.body)}
    </>
  ),
}));

import type { PickedGif } from "@/components/composer/gif-picker-button";
import { MESSAGE_MAX_LENGTH } from "@/lib/message-rules";

import { MessageComposer } from "./message-composer";

function renderComposer(kind: "agent" | "person" = "person") {
  render(
    <MessageComposer conversationId="c1" placeholder="Write…" kind={kind} />,
  );
  return screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "messageLabel",
  });
}

/** Lets PromptInput's async submit run to the end. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A tRPC error as the client gets it from the server. */
function serverError(code: string) {
  return TRPCClientError.from({
    error: { message: code, code: -32600, data: { code, httpStatus: 400 } },
  });
}

/** A promise the test settles by hand. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("MessageComposer", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    nextPick.gif = null;
    toast.error.mockReset();
    // Run the caret fix-up at once instead of on the next frame.
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // jsdom has no execCommand; drop the one a test put there.
    Reflect.deleteProperty(document, "execCommand");
  });

  it("names the field and the send button in the member's language", () => {
    const textarea = renderComposer();

    expect(textarea).toHaveAttribute("placeholder", "Write…");
    expect(screen.getByRole("button", { name: "send" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("stops the field at the longest message the server takes", () => {
    const textarea = renderComposer();

    expect(textarea.maxLength).toBe(MESSAGE_MAX_LENGTH);
  });

  it("inserts a picked emoji at the end when the field was never focused", () => {
    const textarea = renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "emoji" }));

    expect(textarea.value).toBe("🎉");
  });

  it("inserts a picked emoji at the caret", () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "Hi there" } });
    textarea.setSelectionRange(2, 2);

    fireEvent.click(screen.getByRole("button", { name: "emoji" }));

    expect(textarea.value).toBe("Hi🎉 there");
  });

  it("hands the text as typed to send on Enter", async () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "  hello  " } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ content: "  hello  ", gif: null });
  });

  it("clears the field after a successful send", async () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "hello" } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledWith({ content: "hello", gif: null });
    expect(textarea.value).toBe("");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("puts the text back and says so when the send fails", async () => {
    send.mockRejectedValue(new Error("offline"));
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "  hello  " } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledWith({ content: "  hello  ", gif: null });
    expect(textarea.value).toBe("  hello  ");
    expect(toast.error).toHaveBeenCalledWith("sendFailed");
  });

  it("puts the failed text back in front of newer text, as one undoable edit", async () => {
    // Record the browser insert command applyEdit uses; report it missing
    // so the value is set directly, as in browsers without it.
    const execCommand = vi.fn(() => false);
    Object.defineProperty(document, "execCommand", {
      value: execCommand,
      configurable: true,
    });
    const pending = deferred();
    send.mockReturnValue(pending.promise);
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();
    expect(textarea.value).toBe("");

    fireEvent.change(textarea, { target: { value: "and another thing" } });
    pending.reject(new Error("offline"));
    await settle();

    const combined = "hello\nand another thing";
    expect(textarea.value).toBe(combined);
    expect(execCommand).toHaveBeenCalledWith("insertText", false, "hello\n");
    expect(document.activeElement).toBe(textarea);
    expect(textarea.selectionStart).toBe(combined.length);
    expect(textarea.selectionEnd).toBe(combined.length);
    expect(toast.error).toHaveBeenCalledWith("sendFailed");
  });
  it("no GIF button in an agent conversation", () => {
    renderComposer("agent");

    expect(screen.queryByRole("button", { name: "gif" })).toBeNull();
    expect(screen.getByRole("button", { name: "emoji" })).toBeInTheDocument();
  });

  it("a picked GIF shows with a remove button, and removing it clears it", () => {
    renderComposer();
    const gifButton = screen.getByRole("button", { name: "gif" });

    fireEvent.click(gifButton);

    const still = screen.getByRole("img", { name: "Party parrot" });
    expect(still).toHaveAttribute("src", partyGif.preview.stillUrl);
    expect(screen.getByText("gifBadge")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "removeGif" }));

    expect(screen.queryByRole("img", { name: "Party parrot" })).toBeNull();
    expect(screen.queryByRole("button", { name: "removeGif" })).toBeNull();
    expect(document.activeElement).toBe(gifButton);
  });

  it("shows the picked GIF small, so the conversation above stays in view", () => {
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "gif" }));

    const still = screen.getByRole("img", { name: "Party parrot" });
    expect(still.closest("[data-slot='media-preview']")).toHaveAttribute(
      "data-size",
      "compact",
    );
  });

  it("picking another GIF replaces the first", () => {
    renderComposer();

    fireEvent.click(screen.getByRole("button", { name: "gif" }));
    nextPick.gif = catGif;
    fireEvent.click(screen.getByRole("button", { name: "gif" }));

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("img", { name: "Keyboard cat" })).toHaveAttribute(
      "src",
      catGif.preview.stillUrl,
    );
    expect(screen.queryByRole("img", { name: "Party parrot" })).toBeNull();
  });

  it("sends a GIF-only message", async () => {
    const textarea = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "gif" }));

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ content: "", gif: partyGif });
  });

  it("Enter in the GIF search does not send", async () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "gif" }));

    fireEvent.keyDown(screen.getByRole("textbox", { name: "gif search" }), {
      key: "Enter",
    });
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it("a failed send keeps the GIF and the words", async () => {
    send.mockRejectedValueOnce(new Error("offline"));
    const textarea = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "gif" }));
    fireEvent.change(textarea, { target: { value: "look" } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(
      screen.getByRole("img", { name: "Party parrot" }),
    ).toBeInTheDocument();
    expect(textarea.value).toBe("look");
    expect(toast.error).toHaveBeenCalledWith("sendFailed");

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, { content: "look", gif: partyGif });
  });

  it("a failed GIF-only send leaves the field as it was", async () => {
    send.mockRejectedValueOnce(new Error("offline"));
    const textarea = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "gif" }));

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(textarea.value).toBe("");
    expect(
      screen.getByRole("img", { name: "Party parrot" }),
    ).toBeInTheDocument();
  });

  it("a successful send clears the GIF", async () => {
    const textarea = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "gif" }));
    fireEvent.change(textarea, { target: { value: "look" } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledWith({ content: "look", gif: partyGif });
    expect(screen.queryByRole("img", { name: "Party parrot" })).toBeNull();
    expect(textarea.value).toBe("");
  });

  it("a GIF picked while sending stays after the send", async () => {
    const pending = deferred();
    send.mockReturnValueOnce(pending.promise);
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "hello" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    fireEvent.click(screen.getByRole("button", { name: "gif" }));
    pending.resolve();
    await settle();

    expect(
      screen.getByRole("img", { name: "Party parrot" }),
    ).toBeInTheDocument();
  });

  it("says the GIF is gone when the server no longer knows it", async () => {
    send.mockRejectedValueOnce(serverError("BAD_REQUEST"));
    const textarea = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "gif" }));

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(toast.error).toHaveBeenCalledWith("gifGone");
  });

  it("says GIFs are unavailable when GIPHY is off", async () => {
    send.mockRejectedValueOnce(serverError("PRECONDITION_FAILED"));
    const textarea = renderComposer();
    fireEvent.click(screen.getByRole("button", { name: "gif" }));

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(toast.error).toHaveBeenCalledWith("gifUnavailable");
  });

  it("a refused message without a GIF says it did not send", async () => {
    send.mockRejectedValueOnce(serverError("BAD_REQUEST"));
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "hello" } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(toast.error).toHaveBeenCalledWith("sendFailed");
  });
});
