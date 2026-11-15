import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const send = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
  useLocale: () => "en",
}));
vi.mock("./use-send-message", () => ({
  useSendMessage: () => ({ send, isPending: false }),
}));
vi.mock("@/components/composer/emoji-picker-button", () => ({
  EmojiPickerButton: ({ onPick }: { onPick: (emoji: string) => void }) => (
    <div>
      <button type="button" onClick={() => onPick("🎉")}>
        emoji
      </button>
      <input aria-label="emoji search" />
    </div>
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

describe("MessageComposer", () => {
  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(undefined);
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

  it("sends the trimmed text on Enter", async () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "  hello  " } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("hello");
  });

  it("sends nothing for whitespace", async () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "   " } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).not.toHaveBeenCalled();
  });

  it("Enter outside the textarea does not send", async () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "hello" } });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "emoji search" }), {
      key: "Enter",
    });
    await settle();

    expect(send).not.toHaveBeenCalled();
    expect(textarea.value).toBe("hello");
  });

  it("clears the field after sending", async () => {
    const textarea = renderComposer();
    fireEvent.change(textarea, { target: { value: "hello" } });

    fireEvent.keyDown(textarea, { key: "Enter" });
    await settle();

    expect(send).toHaveBeenCalledWith("hello");
    expect(textarea.value).toBe("");
  });
});
