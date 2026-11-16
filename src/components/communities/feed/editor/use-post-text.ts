"use client";

import { useCallback, useRef, useState } from "react";

import { applyEdit, insertAtCaret } from "@/components/composer/text-edit";
import { POST_MAX_LENGTH } from "@/lib/feed-post-rules";
import type { TextEdit } from "@/lib/post-format";
import { mentionsIn, type PostMention } from "@/lib/post-mentions";

/**
 * The text of a post being written, with ways to insert at the cursor (an
 * emoji), to mention a member, and to apply formatting, all the way typing
 * would: undoable, replacing any selected text, and leaving the caret or
 * selection where it belongs. The text may run past the limit; `tooLong`
 * says so, and the form will not send it.
 *
 * It also keeps whom the text mentions: each "@Name" picked from the list
 * (and, for an edit, the post's own). A mention whose name is no longer in
 * the text is not sent.
 */
export function usePostText(
  initial: string,
  initialMentions: readonly PostMention[] = [],
) {
  const [value, setValue] = useState(initial);
  const [mentions, setMentions] = useState<PostMention[]>(() =>
    initialMentions.map(({ userId, name }) => ({ userId, name })),
  );
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insert = useCallback((text: string) => {
    insertAtCaret(textareaRef.current, text, (next) => setValue(next));
  }, []);

  /**
   * Writes "@Name " over the "@query" typed from `start` to the caret, and
   * remembers whom it points at (not for "@everyone", which is no member:
   * `track` false).
   */
  const mention = useCallback(
    (start: number, member: PostMention, { track = true } = {}) => {
      const field = textareaRef.current;
      const current = field?.value ?? "";
      const end = field?.selectionEnd ?? current.length;
      const written = `@${member.name} `;
      const caret = start + written.length;
      applyEdit(
        field,
        {
          value: current.slice(0, start) + written + current.slice(end),
          start: caret,
          end: caret,
        },
        (next) => setValue(next),
      );
      if (!track) return;
      setMentions((list) => [
        ...list.filter((m) => m.userId !== member.userId),
        { userId: member.userId, name: member.name },
      ]);
    },
    [],
  );

  /** Puts back saved text and its mentions (a draft, or a reset). */
  const restore = useCallback(
    (text: string, saved: readonly PostMention[] = []) => {
      setValue(text);
      setMentions([...saved]);
    },
    [],
  );

  /**
   * Applies a formatting change (post-format's toggleWrap or toggleList)
   * to the current selection, then selects what it returns.
   */
  const format = useCallback(
    (edit: (value: string, start: number, end: number) => TextEdit) => {
      const field = textareaRef.current;
      const start = field?.selectionStart ?? 0;
      const end = field?.selectionEnd ?? start;
      applyEdit(field, edit(field?.value ?? "", start, end), (next) =>
        setValue(next),
      );
    },
    [],
  );

  const current = mentionsIn(value, mentions);

  return {
    value,
    setValue,
    textareaRef,
    insert,
    mention,
    restore,
    format,
    /** Whom the text mentions now, to save with a draft. */
    mentions: current,
    /** The ids of whom the text mentions, to send with the post. */
    mentionIds: current.map((m) => m.userId),
    tooLong: value.length > POST_MAX_LENGTH,
  };
}
