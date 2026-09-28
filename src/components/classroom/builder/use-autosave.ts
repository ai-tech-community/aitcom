"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict";

export type UseAutosaveOptions<T> = {
  /** Current draft. The first value seen is the baseline and is never saved. */
  value: T;
  /** Persists a value. Throws on failure; an Error whose message is a conflict code marks a conflict. */
  save: (value: T) => Promise<void>;
  /** Debounce after the last change. Default 1000 ms. */
  delayMs?: number;
  /** false = never saves (read-only / archived). */
  enabled?: boolean;
  /** Default: JSON equality. */
  isEqual?: (a: T, b: T) => boolean;
};

export type UseAutosaveResult = {
  status: AutosaveStatus;
  savedAt: Date | null;
  /**
   * Save now if there is unsaved work; resolves when every queued save has settled,
   * with the status at that moment (React state lags behind, so callers that must
   * decide right after a flush — publish, preview — read this instead).
   */
  flush: () => Promise<AutosaveStatus>;
  /** Try again after an error. Does nothing in a conflict — the server would reject it again. */
  retry: () => Promise<AutosaveStatus>;
};

/** Server codes meaning "someone else changed this first": a conflict, not an error. */
export const CONFLICT_CODES: ReadonlySet<string> = new Set(["COURSE_CHANGED", "LESSON_CHANGED"]);
const jsonEqual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Debounced autosave for one draft value — the builder's single save model:
 * no Save buttons, one visible status.
 *
 * Design: all mutable save state lives in refs, so timers, the unmount flush
 * and callers of `flush` always see the latest value (no stale closures).
 * Saving runs as one "save loop" at a time: a request that arrives while the
 * loop is running (debounce fired, `flush`, unmount) does not start a second
 * save; it asks the running loop for one more pass, which then saves the
 * newest value. So saves never overlap and the newest value always wins.
 * An error stops the loop and keeps the draft (a new edit or `retry` tries
 * again); a conflict stops all saving until the pane is reloaded.
 */
export function useAutosave<T>({
  value,
  save,
  delayMs = 1000,
  enabled = true,
  isEqual = jsonEqual,
}: UseAutosaveOptions<T>): UseAutosaveResult {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const latestRef = useRef(value);
  const persistedRef = useRef(value);
  const saveRef = useRef(save);
  const isEqualRef = useRef(isEqual);
  const enabledRef = useRef(enabled);
  const statusRef = useRef<AutosaveStatus>("idle");
  const savedOnceRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loopRef = useRef<Promise<void> | null>(null);
  const followUpRef = useRef(false);

  // Keep refs in step with props. Declared first so later effects in the same commit see fresh values.
  useEffect(() => {
    latestRef.current = value;
    saveRef.current = save;
    isEqualRef.current = isEqual;
    enabledRef.current = enabled;
  });

  const updateStatus = useCallback((next: AutosaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const isDirty = useCallback(() => !isEqualRef.current(latestRef.current, persistedRef.current), []);

  const canSave = useCallback(
    () => enabledRef.current && !conflictRef.current && isDirty(),
    [isDirty],
  );

  /** Start the save loop, or ask the running one for one more pass. */
  const drain = useCallback((): Promise<void> => {
    if (loopRef.current) {
      followUpRef.current = true;
      return loopRef.current;
    }
    if (!canSave()) return Promise.resolve();

    let settled = false;
    const loop = (async () => {
      try {
        do {
          followUpRef.current = false;
          const snapshot = latestRef.current;
          updateStatus("saving");
          try {
            await saveRef.current(snapshot);
          } catch (err) {
            const code = err instanceof Error ? err.message : undefined;
            if (code && CONFLICT_CODES.has(code)) {
              conflictRef.current = true;
              clearTimer();
              updateStatus("conflict");
            } else {
              updateStatus("error");
            }
            return;
          }
          persistedRef.current = snapshot;
          savedOnceRef.current = true;
          setSavedAt(new Date());
          // Another pass when someone asked for one (debounce fired, flush, unmount), or when the
          // draft is still dirty and no pending timer will save it — e.g. the author undid back to
          // the pre-save value mid-save, so the edit effect saw "clean" and scheduled nothing.
        } while (canSave() && (followUpRef.current || timerRef.current === null));
        // Still dirty here means a debounce timer is pending for the newer value, or saving is off.
        updateStatus(isDirty() ? "dirty" : "saved");
      } finally {
        settled = true;
        loopRef.current = null;
      }
    })();
    // `save` may throw synchronously, settling the loop before this line runs.
    if (!settled) loopRef.current = loop;
    return loop;
  }, [canSave, clearTimer, isDirty, updateStatus]);

  const schedule = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void drain();
    }, delayMs);
  }, [clearTimer, delayMs, drain]);

  // React to edits and to the pane becoming editable.
  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }
    if (conflictRef.current) return;
    if (!isDirty()) {
      // The author undid their change before it was saved: nothing is pending any more.
      clearTimer();
      if (statusRef.current === "dirty" || statusRef.current === "error") {
        updateStatus(savedOnceRef.current ? "saved" : "idle");
      }
      return;
    }
    if (statusRef.current !== "saving") updateStatus("dirty");
    schedule();
  }, [value, enabled, clearTimer, isDirty, schedule, updateStatus]);

  // On unmount, flush pending work (fire-and-forget) so switching panes never loses typing.
  // Deps are stable, so under StrictMode this only runs on the fake unmount at mount time,
  // when nothing can be dirty yet.
  useEffect(
    () => () => {
      clearTimer();
      if (canSave()) void drain();
    },
    [canSave, clearTimer, drain],
  );

  const flush = useCallback(async (): Promise<AutosaveStatus> => {
    clearTimer();
    await drain();
    return statusRef.current;
  }, [clearTimer, drain]);

  return { status, savedAt, flush, retry: flush };
}

/** Browser "leave site?" prompt while there is work that is not safely saved. */
export function useUnsavedChangesGuard(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}
