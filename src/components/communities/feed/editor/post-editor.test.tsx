import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, v?: { count: number }) =>
    v ? `${k}:${v.count}` : k,
  useLocale: () => "en",
}));

import { createMemoryStorage } from "@/test/memory-storage";

import { PostEditor } from "./post-editor";
import { usePostDraft } from "./use-post-draft";
import { usePostText } from "./use-post-text";

function Editor(props: {
  initial?: string;
  onImageFile?: (file: File) => void;
  onSubmitShortcut?: () => void;
}) {
  const text = usePostText(props.initial ?? "");
  return (
    <>
      <PostEditor
        text={text}
        label="Write a post"
        onImageFile={props.onImageFile}
        onSubmitShortcut={props.onSubmitShortcut}
        tools={
          <button type="button" onClick={() => text.insert("🎉")}>
            party
          </button>
        }
      />
      <output>{text.value}</output>
    </>
  );
}

const picture = new File(["x"], "pic.png", { type: "image/png" });

describe("PostEditor", () => {
  it("inserts at the cursor, replacing the selection", () => {
    render(<Editor initial="Hello world" />);
    const field = screen.getByRole("textbox", { name: "Write a post" });
    (field as HTMLTextAreaElement).setSelectionRange(6, 11);
    fireEvent.click(screen.getByRole("button", { name: "party" }));
    expect(screen.getByRole("status")).toHaveTextContent("Hello 🎉");
  });

  it("takes a pasted picture instead of pasting it as text", () => {
    const onImageFile = vi.fn();
    render(<Editor onImageFile={onImageFile} />);
    const pasted = fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: { files: [picture] },
    });
    expect(onImageFile).toHaveBeenCalledWith(picture);
    expect(pasted).toBe(false);
  });

  it("leaves a normal paste alone, and pictures when none can be added", () => {
    render(<Editor />);
    const pasted = fireEvent.paste(screen.getByRole("textbox"), {
      clipboardData: { files: [picture] },
    });
    expect(pasted).toBe(true);
  });

  it("takes a dropped picture", () => {
    const onImageFile = vi.fn();
    const { container } = render(<Editor onImageFile={onImageFile} />);
    const field = container.querySelector("[data-dragging], .rounded-lg")!;
    fireEvent.drop(field, {
      dataTransfer: { types: ["Files"], files: [picture] },
    });
    expect(onImageFile).toHaveBeenCalledWith(picture);
  });

  it("posts with Ctrl+Enter or Cmd+Enter", () => {
    const onSubmitShortcut = vi.fn();
    render(<Editor onSubmitShortcut={onSubmitShortcut} />);
    const field = screen.getByRole("textbox");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onSubmitShortcut).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
    expect(onSubmitShortcut).toHaveBeenCalledTimes(2);
  });

  it("shows how many characters are left only near the limit", () => {
    const { unmount } = render(<Editor initial="short" />);
    expect(screen.queryByText(/charactersLeft/)).toBeNull();
    unmount();
    render(<Editor initial={"x".repeat(1950)} />);
    expect(screen.getByText("charactersLeft:50")).toBeVisible();
    expect(screen.getByRole("textbox")).toHaveAccessibleDescription(
      "charactersLeft:50",
    );
  });
});

describe("usePostDraft", () => {
  const KEY = "aitcom:post-draft:new:mlops";
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", createMemoryStorage());
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function useDraft(base: string, start: string) {
    const text = usePostText(start);
    const draft = usePostDraft({
      key: "new:mlops",
      base,
      text: text.value,
      restore: text.setValue,
    });
    return { text, draft };
  }

  it("saves unsent text and brings it back after a reload", () => {
    const first = renderHook(() => useDraft("", ""));
    act(() => first.result.current.text.setValue("Half a thought"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    first.unmount();

    const again = renderHook(() => useDraft("", ""));
    expect(again.result.current.text.value).toBe("Half a thought");
    expect(again.result.current.draft.restored).toBe(true);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({
      text: "Half a thought",
      base: "",
    });
  });

  it("forgets a draft once the text is back to where it started, or on clear", () => {
    localStorage.setItem(KEY, JSON.stringify({ text: "Old", base: "" }));
    const { result } = renderHook(() => useDraft("", ""));
    act(() => result.current.text.setValue(""));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(localStorage.getItem(KEY)).toBeNull();

    act(() => result.current.text.setValue("New"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => result.current.draft.clear());
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(result.current.draft.restored).toBe(false);
  });

  it("drops a draft written for a different starting text (the post changed)", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ text: "Edited old text", base: "Old text" }),
    );
    const { result } = renderHook(() => useDraft("New text", "New text"));
    expect(result.current.text.value).toBe("New text");
    expect(result.current.draft.restored).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps working when storage is blocked", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    vi.stubGlobal("localStorage", {
      ...createMemoryStorage(),
      getItem: blocked,
      setItem: blocked,
      removeItem: blocked,
    });
    const { result } = renderHook(() => useDraft("", ""));
    act(() => result.current.text.setValue("Still typing"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.text.value).toBe("Still typing");
  });
});
