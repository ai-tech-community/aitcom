import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

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

import { MessageComposer } from "./message-composer";

function renderComposer() {
  render(<MessageComposer conversationId="c1" placeholder="Write…" />);
  return screen.getByPlaceholderText<HTMLTextAreaElement>("Write…");
}

/** Lets PromptInput's async submit run to the end. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A promise the test settles by hand. */
function deferred() {
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((_resolve, rej) => {
    reject = rej;
  });
  return { promise, reject };
}

describe("MessageComposer", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
    toast.error.mockReset();
    // Run the caret fix-up at once instead of on the next frame.
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(send).toHaveBeenCalledWith("  hello  ");
  });

  it("clears the field after a successful send", async () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "hello" } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledWith("hello");
    expect(textarea.value).toBe("");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("puts the text back and says so when the send fails", async () => {
    send.mockRejectedValue(new Error("offline"));
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "  hello  " } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledWith("  hello  ");
    expect(textarea.value).toBe("  hello  ");
    expect(toast.error).toHaveBeenCalledWith("sendFailed");
  });

  it("keeps newer text when a send fails after the member typed on", async () => {
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

    expect(textarea.value).toBe("and another thing");
    expect(toast.error).toHaveBeenCalledWith("sendFailed");
  });
});
