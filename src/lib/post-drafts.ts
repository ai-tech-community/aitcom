/**
 * Unsent feed post text kept in this browser (see `usePostDraft`). Keys
 * carry the member's id, so on a shared computer one member's draft never
 * shows up for another; signing out clears them all.
 */
const PREFIX = "aitcom:post-draft:";

export type StoredDraft = { text: string; base: string };

/** Where one member's draft for one post (or new post) lives. */
export function postDraftKey(userId: string, target: string): string {
  return `${PREFIX}${userId}:${target}`;
}

export function readPostDraft(key: string): StoredDraft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<StoredDraft>;
    return typeof draft.text === "string" && typeof draft.base === "string"
      ? { text: draft.text, base: draft.base }
      : null;
  } catch {
    return null;
  }
}

export function writePostDraft(key: string, draft: StoredDraft | null) {
  try {
    if (draft) window.localStorage.setItem(key, JSON.stringify(draft));
    else window.localStorage.removeItem(key);
  } catch {
    // Storage blocked or full: drafts are a convenience, never required.
  }
}

/** Removes every post draft in this browser (on sign-out). */
export function clearAllPostDrafts() {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
