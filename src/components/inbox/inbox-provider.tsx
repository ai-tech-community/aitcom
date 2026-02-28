"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Breakpoint = "desktop" | "tablet" | "mobile";

type InboxState = {
  isListOpen: boolean;
  openChats: string[];
  minimizedChats: string[];
  activeChat: string | null;
};

type InboxActions = {
  toggleList: () => void;
  openChat: (conversationId: string) => void;
  closeChat: (conversationId: string) => void;
  minimizeChat: (conversationId: string) => void;
  restoreChat: (conversationId: string) => void;
  setActiveChat: (conversationId: string | null) => void;
};

type InboxContextValue = InboxState & InboxActions & { breakpoint: Breakpoint };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DESKTOP_MIN = 1024;
const TABLET_MIN = 768;

function getBreakpoint(width: number): Breakpoint {
  if (width >= DESKTOP_MIN) return "desktop";
  if (width >= TABLET_MIN) return "tablet";
  return "mobile";
}

function maxChatsForBreakpoint(bp: Breakpoint): number {
  switch (bp) {
    case "desktop":
      return 2;
    case "tablet":
      return 1;
    case "mobile":
      return 0; // mobile uses activeChat fullscreen instead
  }
}

// ---------------------------------------------------------------------------
// Breakpoint hook
// ---------------------------------------------------------------------------

function useBreakpoint(): Breakpoint {
  // Always start with "desktop" so SSR and client initial render match.
  // The useEffect below syncs to the real breakpoint immediately after hydration.
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");

  useEffect(() => {
    function handleResize() {
      setBreakpoint(getBreakpoint(window.innerWidth));
    }

    // Sync on mount in case SSR default differs from client
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return breakpoint;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const InboxContext = createContext<InboxContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const INITIAL_STATE: InboxState = {
  isListOpen: false,
  openChats: [],
  minimizedChats: [],
  activeChat: null,
};

export function InboxProvider({ children }: { children: ReactNode }) {
  const breakpoint = useBreakpoint();
  const [state, setState] = useState<InboxState>(INITIAL_STATE);

  // -----------------------------------------------------------------------
  // Enforce max open chats when the breakpoint changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    setState((prev) => {
      const max = maxChatsForBreakpoint(breakpoint);
      if (prev.openChats.length <= max) return prev;

      // Move the oldest (front of array) chats to minimized
      const overflow = prev.openChats.slice(0, prev.openChats.length - max);
      const kept = prev.openChats.slice(prev.openChats.length - max);

      return {
        ...prev,
        openChats: kept,
        minimizedChats: [...prev.minimizedChats, ...overflow],
      };
    });
  }, [breakpoint]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const toggleList = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isListOpen: !prev.isListOpen,
      // When closing the list, also clear activeChat
      activeChat: prev.isListOpen ? null : prev.activeChat,
    }));
  }, []);

  const openChat = useCallback(
    (conversationId: string) => {
      setState((prev) => {
        // If on mobile, set as activeChat instead
        if (breakpoint === "mobile") {
          return {
            ...prev,
            activeChat: conversationId,
            // Remove from minimized if it was there
            minimizedChats: prev.minimizedChats.filter(
              (id) => id !== conversationId,
            ),
          };
        }

        // Already open - no-op
        if (prev.openChats.includes(conversationId)) return prev;

        // Remove from minimized if restoring
        const nextMinimized = prev.minimizedChats.filter(
          (id) => id !== conversationId,
        );

        const max = maxChatsForBreakpoint(breakpoint);
        let nextOpen = [...prev.openChats, conversationId];

        // If exceeding max, auto-minimize the oldest (front of array)
        if (nextOpen.length > max) {
          const overflow = nextOpen.slice(0, nextOpen.length - max);
          nextOpen = nextOpen.slice(nextOpen.length - max);
          return {
            ...prev,
            openChats: nextOpen,
            minimizedChats: [...nextMinimized, ...overflow],
          };
        }

        return {
          ...prev,
          openChats: nextOpen,
          minimizedChats: nextMinimized,
        };
      });
    },
    [breakpoint],
  );

  const closeChat = useCallback((conversationId: string) => {
    setState((prev) => ({
      ...prev,
      openChats: prev.openChats.filter((id) => id !== conversationId),
      minimizedChats: prev.minimizedChats.filter((id) => id !== conversationId),
      activeChat:
        prev.activeChat === conversationId ? null : prev.activeChat,
    }));
  }, []);

  const minimizeChat = useCallback((conversationId: string) => {
    setState((prev) => {
      if (!prev.openChats.includes(conversationId)) return prev;

      return {
        ...prev,
        openChats: prev.openChats.filter((id) => id !== conversationId),
        minimizedChats: [...prev.minimizedChats, conversationId],
      };
    });
  }, []);

  const restoreChat = useCallback(
    (conversationId: string) => {
      // restoreChat behaves the same as openChat (removes from minimized first)
      openChat(conversationId);
    },
    [openChat],
  );

  const setActiveChat = useCallback((conversationId: string | null) => {
    setState((prev) => ({
      ...prev,
      activeChat: conversationId,
    }));
  }, []);

  // -----------------------------------------------------------------------
  // Context value
  // -----------------------------------------------------------------------

  const value: InboxContextValue = {
    ...state,
    breakpoint,
    toggleList,
    openChat,
    closeChat,
    minimizeChat,
    restoreChat,
    setActiveChat,
  };

  return (
    <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hook
// ---------------------------------------------------------------------------

export function useInbox(): InboxContextValue {
  const context = useContext(InboxContext);

  if (!context) {
    throw new Error("useInbox must be used within an <InboxProvider>");
  }

  return context;
}
