"use client";

import { useCallback, useRef, useState } from "react";

import { POST_MAX_LENGTH } from "@/lib/feed-post-rules";
import type { TextEdit } from "@/lib/post-format";

/**
 * The text of a post being written, with a way to insert at the cursor
 * (an emoji, later a mention) the way typing would: replacing any selected
 * text, then putting the caret right after what was inserted. The text may
 * run past the limit; `tooLong` says so, and the form will not send it.
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
    setValue(field.value.slice(0, start) + text + field.value.slice(end));
    const caret = start + text.length;
    // After React writes the new value, put the caret back in place.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  }, []);

  /**
   * Applies a formatting change (post-format's toggleWrap or toggleList)
   * to the current selection, then selects what it returns.
   */
  const format = useCallback(
    (edit: (value: string, start: number, end: number) => TextEdit) => {
      const field = textareaRef.current;
      const start = field?.selectionStart ?? 0;
      const end = field?.selectionEnd ?? start;
      const next = edit(field?.value ?? "", start, end);
      setValue(next.value);
      requestAnimationFrame(() => {
        field?.focus();
        field?.setSelectionRange(next.start, next.end);
      });
    },
    [],
  );

  return {
    value,
    setValue,
    textareaRef,
    insert,
    format,
    tooLong: value.length > POST_MAX_LENGTH,
  };
}
