"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * In-memory store for an API key that was just generated/regenerated in
 * the current tab. The server only ever returns a prefix; the full key
 * is available exactly once at generation time. We hold it here so the
 * connect-tab MCP snippets can render with a real, copy-paste-ready key
 * — until the user reloads, at which point the key is gone and they
 * must Regenerate again to get a paste-ready snippet.
 *
 * Never persisted (no localStorage, no sessionStorage). Page reload =
 * full key forgotten.
 */
interface RevealedKeyContextValue {
  fullKey: string | null;
  setFullKey: (key: string | null) => void;
}

const RevealedKeyContext = createContext<RevealedKeyContextValue | null>(null);

export function RevealedKeyProvider({ children }: { children: ReactNode }) {
  const [fullKey, setFullKey] = useState<string | null>(null);
  return (
    <RevealedKeyContext.Provider value={{ fullKey, setFullKey }}>
      {children}
    </RevealedKeyContext.Provider>
  );
}

export function useRevealedKey(): RevealedKeyContextValue {
  const ctx = useContext(RevealedKeyContext);
  if (!ctx) {
    return { fullKey: null, setFullKey: () => undefined };
  }
  return ctx;
}
