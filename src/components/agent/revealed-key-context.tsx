"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

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
  revealedAt: number;
  setFullKey: (key: string | null) => void;
}

const RevealedKeyContext = createContext<RevealedKeyContextValue | null>(null);

export function RevealedKeyProvider({ children }: { children: ReactNode }) {
  const [reveal, setReveal] = useState<{ key: string; at: number } | null>(
    null,
  );
  const setFullKey = useCallback((key: string | null) => {
    setReveal(key ? { key, at: Date.now() } : null);
  }, []);
  return (
    <RevealedKeyContext.Provider
      value={{
        fullKey: reveal?.key ?? null,
        revealedAt: reveal?.at ?? 0,
        setFullKey,
      }}
    >
      {children}
    </RevealedKeyContext.Provider>
  );
}

export function useRevealedKey(): RevealedKeyContextValue {
  const ctx = useContext(RevealedKeyContext);
  if (!ctx) {
    return { fullKey: null, revealedAt: 0, setFullKey: () => undefined };
  }
  return ctx;
}

/** A successful refresh can reveal revocation or rotation in another tab. */
export function useCurrentRevealedKey(query: {
  isSuccess: boolean;
  dataUpdatedAt: number;
  data?: { prefix: string } | null;
}) {
  const { fullKey, revealedAt } = useRevealedKey();
  if (
    query.isSuccess &&
    query.dataUpdatedAt > revealedAt &&
    (!query.data || !fullKey?.startsWith(query.data.prefix))
  ) {
    return null;
  }
  return fullKey;
}
