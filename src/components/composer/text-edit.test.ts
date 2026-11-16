import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { insertAtCaret } from "./text-edit";

/** A textarea in the page holding `value`, with `start`–`end` selected. */
function field(value: string, start: number, end: number) {
  const el = document.createElement("textarea");
  document.body.append(el);
  el.value = value;
  el.setSelectionRange(start, end);
  return el;
}

/** Writes straight into the field, as React would after `setValue`. */
function writeTo(el: HTMLTextAreaElement) {
  return vi.fn((value: string) => {
    el.value = value;
  });
}

describe("insertAtCaret", () => {
  beforeEach(() => {
    // Run the caret fix-up at once instead of on the next frame.
    vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
      run(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("inserts at the caret", () => {
    const el = field("Hello world", 5, 5);

    insertAtCaret(el, "🎉", writeTo(el));

    expect(el.value).toBe("Hello🎉 world");
    expect(el.selectionStart).toBe(7);
    expect(el.selectionEnd).toBe(7);
  });

  it("replaces the selection", () => {
    const el = field("Hello world", 6, 11);

    insertAtCaret(el, "🎉", writeTo(el));

    expect(el.value).toBe("Hello 🎉");
  });

  it("with no field hands the text to setValue", () => {
    const setValue = vi.fn();

    insertAtCaret(null, "🎉", setValue);

    expect(setValue).toHaveBeenCalledWith("🎉");
  });
});
