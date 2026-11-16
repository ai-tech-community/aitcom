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

import { MESSAGE_MAX_LENGTH } from "@/lib/message-rules";

import { MessageComposer } from "./message-composer";

function renderComposer() {
  render(<MessageComposer conversationId="c1" placeholder="Write…" />);
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
});
