"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { postDraftKey, readPostDraft, writePostDraft } from "@/lib/post-drafts";
import type { PostMention } from "@/lib/post-mentions";

const SAVE_DELAY_MS = 400;

/**
 * Keeps unsent post text in this browser, so a reload or a closed tab does
 * not lose it. Drafts belong to one member (`userId`) and one target (a
 * community's new post, or one post being edited). `base` is the text the
 * member started from (empty for a new post, the post's text for an edit).
 *
 * Whom the text mentions is kept with it, so a restored "@Name" still
 * points at the member picked.
 *
 * On mount a saved draft is put back through `restore`, only while the
 * post still starts from the same text, and `restored` says so until the
 * member types again. Text equal to `base` is not a draft and is removed.
 */
export function usePostDraft({
  userId,
  target,
  base,
  text,
  mentions,
  restore,
}: {
  userId: string;
  target: string;
  base: string;
  text: string;
  mentions: readonly PostMention[];
  restore: (text: string, mentions: PostMention[]) => void;
}) {
  const key = postDraftKey(userId, target);
  // Mentions change only with the text, so the text alone times the save.
  const latestMentions = useRef(mentions);
  latestMentions.current = mentions;
  const [restored, setRestored] = useState(false);
  const restoredText = useRef<string | null>(null);
  // The first save runs before a restored draft reaches `text`; skipping it
  // keeps the draft from being overwritten with `base`.
  const skipNextSave = useRef(true);

  useEffect(() => {
    const draft = readPostDraft(key);
    if (draft?.base === base && draft.text !== base) {
      restoredText.current = draft.text;
      restore(draft.text, draft.mentions ?? []);
      setRestored(true);
    } else if (draft) {
      writePostDraft(key, null);
    }
    // Only on mount and when the post changes; `restore` is a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, base]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    // Typing on: the restored text is now simply the member's text.
    if (restoredText.current !== null && text !== restoredText.current) {
      restoredText.current = null;
      setRestored(false);
    }
    const timer = window.setTimeout(() => {
      writePostDraft(
        key,
        text === base
          ? null
          : { text, base, mentions: [...latestMentions.current] },
      );
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key, base, text]);

  /** The post was sent or the changes thrown away: nothing to keep. */
  const clear = useCallback(() => {
    writePostDraft(key, null);
    restoredText.current = null;
    setRestored(false);
  }, [key]);

  return { restored, clear };
}
