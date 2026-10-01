"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const PREFIX = "aitcom:post-draft:";
const SAVE_DELAY_MS = 400;

type StoredDraft = { text: string; base: string };

function read(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<StoredDraft>;
    return typeof draft.text === "string" && typeof draft.base === "string"
      ? { text: draft.text, base: draft.base }
      : null;
  } catch {
    return null;
  }
}

function write(key: string, draft: StoredDraft | null) {
  try {
    if (draft) window.localStorage.setItem(PREFIX + key, JSON.stringify(draft));
    else window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage blocked or full: drafts are a convenience, never required.
  }
}

/**
 * Keeps unsent post text in this browser, so a reload or a closed tab does
 * not lose it. `base` is the text the member started from (empty for a new
 * post, the post's text for an edit). On mount a saved draft is put back
 * through `restore` — only while the post still starts from the same text —
 * and `restored` says so, so the form can offer to discard it. Text equal
 * to `base` is not a draft and is removed.
 */
export function usePostDraft({
  key,
  base,
  text,
  restore,
}: {
  key: string;
  base: string;
  text: string;
  restore: (text: string) => void;
}) {
  const [restored, setRestored] = useState(false);
  // The first save runs before a restored draft reaches `text`; skipping it
  // keeps the draft from being overwritten with `base`.
  const skipNextSave = useRef(true);

  useEffect(() => {
    const draft = read(key);
    if (draft?.base === base && draft.text !== base) {
      restore(draft.text);
      setRestored(true);
    } else if (draft) {
      write(key, null);
    }
    // Only on mount and when the post changes; `restore` is a setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, base]);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      write(key, text === base ? null : { text, base });
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [key, base, text]);

  /** The post was sent or the edit left: nothing to keep. */
  const clear = useCallback(() => {
    write(key, null);
    setRestored(false);
  }, [key]);

  /** The member keeps writing; stop offering to discard. */
  const dismissNotice = useCallback(() => setRestored(false), []);

  return { restored, clear, dismissNotice };
}
