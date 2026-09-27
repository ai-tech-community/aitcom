"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * "Hide until next visit" for the floating reminder. A per-browser-session
 * convenience, not an account setting: sessionStorage lasts until the tab or
 * browser closes, which is what "next visit" promises. The account-level
 * "don't show again" lives on the member profile instead.
 */
export const HIDE_FOR_VISIT_KEY = "onboarding-reminder-hidden";

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.sessionStorage.getItem(HIDE_FOR_VISIT_KEY) === "1";
  } catch {
    return false;
  }
}

// Storage may be blocked; keep an in-memory copy so the choice still holds
// for this page's lifetime.
let memoryHidden = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useHiddenForVisit(): [hidden: boolean, hide: () => void] {
  const hidden = useSyncExternalStore(
    subscribe,
    () => memoryHidden || read(),
    () => false,
  );
  const hide = useCallback(() => {
    memoryHidden = true;
    try {
      window.sessionStorage.setItem(HIDE_FOR_VISIT_KEY, "1");
    } catch {
      // Blocked storage: the in-memory flag covers this page.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [hidden, hide];
}

/** Test seam: forget the in-memory flag between tests. */
export function resetHiddenForVisitForTests() {
  memoryHidden = false;
}
