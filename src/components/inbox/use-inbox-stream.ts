"use client";

import { useEffect } from "react";
import { api } from "@/trpc/react";
import { isChatEnabled } from "@/lib/chat/flags";

type Utils = ReturnType<typeof api.useUtils>;

// Module-level, ref-counted singleton. Multiple components (the floating chat
// window, the mobile view, the /messages shell) can mount this hook at once;
// they must share ONE EventSource so we open a single SSE/Upstash subscription
// per user and invalidate each cache exactly once per event.
let es: EventSource | null = null;
let refCount = 0;

function openConnection(utils: Utils): void {
  es = new EventSource("/api/inbox/stream");

  es.onmessage = (event: MessageEvent) => {
    try {
      const payload = JSON.parse(event.data as string) as {
        kind: string;
        conversationId: string;
        message: unknown;
      };
      if (payload.kind === "message") {
        void utils.inbox.getMessages.invalidate({
          conversationId: payload.conversationId,
        });
        // The conversation sidebar (unread badge, last-message preview, sort
        // order) is driven by listConversations — keep it in sync with the
        // outbound send path, which also invalidates it.
        void utils.inbox.listConversations.invalidate();
        void utils.inbox.totalUnreadCount.invalidate();
      }
    } catch {
      // Malformed frame — ignore, keep stream open.
    }
  };

  es.onerror = () => {
    // Let the browser auto-reconnect; no action needed here.
    console.debug("[useInboxStream] SSE error — browser will reconnect");
  };
}

function closeConnection(): void {
  es?.close();
  es = null;
}

/**
 * Opens (or joins) a shared SSE connection to /api/inbox/stream and invalidates
 * the relevant React Query caches when a `{ kind: "message", conversationId,
 * message }` frame arrives.  All mounted callers share a single ref-counted
 * EventSource; the browser's built-in auto-reconnect handles transient network
 * failures, so this hook does not implement its own retry.
 *
 * No-op when the chat feature flag is disabled.
 */
export function useInboxStream(): void {
  const utils = api.useUtils();

  useEffect(() => {
    if (!isChatEnabled()) return;
    if (typeof EventSource === "undefined") return; // SSR / unsupported

    refCount += 1;
    try {
      if (!es) openConnection(utils);
    } catch {
      // Environment without EventSource — do nothing.
    }

    return () => {
      refCount -= 1;
      if (refCount <= 0) {
        refCount = 0;
        closeConnection();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
