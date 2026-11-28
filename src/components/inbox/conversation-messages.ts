"use client";

import { useEffect } from "react";
import { useShellUnread } from "@/components/shells/shell-unread";
import { api } from "@/trpc/react";

import { LIVE_MESSAGES_FALLBACK_MS } from "./live-refetch";

/** How many messages a conversation view loads. */
export const MESSAGES_PAGE_SIZE = 50;
export const OPTIMISTIC_MESSAGE_PREFIX = "optimistic-";

/**
 * The `inbox.getMessages` input for one conversation: its cache key.
 * Every reader and writer of a conversation's messages (the views, the
 * optimistic send, "mark all read") uses it, so they all share one cache
 * entry.
 */
export function messagesQueryInput(conversationId: string) {
  return { conversationId, limit: MESSAGES_PAGE_SIZE };
}

/**
 * The messages of one conversation, as every conversation view shows
 * them: the latest page, kept fresh by the live stream with a slow poll
 * as fallback (ADR-0025).
 */
export function useConversationMessages(conversationId: string) {
  const { markRead } = useShellUnread();
  const query = api.inbox.getMessages.useQuery(
    messagesQueryInput(conversationId),
    {
      refetchInterval: LIVE_MESSAGES_FALLBACK_MS,
    },
  );
  const latest = query.data?.messages
    .filter((message) => !message.id.startsWith(OPTIMISTIC_MESSAGE_PREFIX))
    .at(-1)?.createdAt;
  const through = latest?.getTime();
  useEffect(() => {
    if (through !== undefined) markRead?.(conversationId, through);
  }, [conversationId, markRead, through]);
  return query;
}
