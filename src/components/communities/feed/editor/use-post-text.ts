"use client";

import { useCallback, useRef, useState } from "react";

/**
 * The text of a post being written, with a way to insert at the cursor
 * (an emoji, later a mention) the way typing would: replacing any selected
 * text, then putting the caret right after what was inserted.
 */
export function usePostText(initial: string) {
  const [value, setValue] = useState(initial);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insert = useCallback((text: string) => {
    const field = textareaRef.current;
    if (!field) {
      setValue((current) => current + text);
      return;
    }
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    const next = field.value.slice(0, start) + text + field.value.slice(end);
    if (next.length > field.maxLength && field.maxLength > 0) return;
    setValue(next);
    const caret = start + text.length;
    // After React writes the new value, put the caret back in place.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }, []);

  return { value, setValue, textareaRef, insert };
}
