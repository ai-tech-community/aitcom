"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * A per-viewer on/off preference remembered in localStorage (a layout
 * convenience only — never state that must persist). Storage can be missing
 * or throw (private windows, blocked site data); the flag then still works
 * for this page visit from memory. Server render and hydration use the
 * default, so there is no hydration mismatch.
 */
const memory = new Map<string, boolean>();
const listeners = new Set<() => void>();

function read(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored !== null) return stored === "1";
  } catch {
    // Fall through to memory.
  }
  return memory.get(key) ?? fallback;
}

function write(key: string, value: boolean) {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Memory still holds it for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function usePersistedFlag(
  key: string,
  fallback = false,
): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback((next: boolean) => write(key, next), [key]);
  return [value, set];
}
