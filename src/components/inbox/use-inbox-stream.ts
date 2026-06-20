"use client";

import { useEffect } from "react";
import { api } from "@/trpc/react";
import { isChatEnabled } from "@/lib/chat/flags";

/**
 * Opens an SSE connection to /api/inbox/stream and invalidates the relevant
 * React Query caches when a `{ kind: "message", conversationId, message }`
 * frame arrives.  The browser's built-in EventSource auto-reconnect handles
 * transient network failures; this hook does not implement its own retry.
 *
 * No-op when the chat feature flag is disabled.
 */
export function useInboxStream(): void {
  const utils = api.useUtils();

  useEffect(() => {
    if (!isChatEnabled()) return;

    let es: EventSource | null = null;

    try {
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
    } catch {
      // Environment without EventSource (e.g. SSR, old browser) — do nothing.
    }

    return () => {
      es?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
