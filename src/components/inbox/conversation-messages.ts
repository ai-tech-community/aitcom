"use client";

import { useEffect, useState } from "react";
import { useShellUnread } from "@/components/shells/shell-unread";
import { api, type RouterOutputs } from "@/trpc/react";

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

type Message = RouterOutputs["inbox"]["getMessages"]["messages"][number];

type OpeningUnread = { count: number; latestAt: number };

export function firstUnreadMessage(
  messages: readonly Pick<
    Message,
    "id" | "createdAt" | "senderType" | "senderId"
  >[],
  opening: OpeningUnread,
  viewerId: string,
) {
  let remaining = opening.count;
  let first: string | undefined;
  for (let i = messages.length - 1; i >= 0 && remaining > 0; i--) {
    const message = messages[i]!;
    if (
      message.createdAt.getTime() > opening.latestAt ||
      message.id.startsWith(OPTIMISTIC_MESSAGE_PREFIX) ||
      (message.senderType === "human" && message.senderId === viewerId)
    )
      continue;
    first = message.id;
    remaining--;
  }
  return first;
}

/**
 * The latest page, kept fresh by the shared stream and foreground polling.
 * The redesigned transcript takes one summary snapshot before the first
 * getMessages call advances the read marker. Unread includes only incoming
 * messages through the summary's last message, even if newer rows arrive
 * before the transcript loads. Later polls do not move the divider.
 */
export function useConversationMessages(
  conversationId: string,
  unreadViewerId?: string,
) {
  const { markRead } = useShellUnread();
  const [opening, setOpening] = useState<
    (OpeningUnread & { conversationId: string }) | null
  >(null);
  const snapshot = opening?.conversationId === conversationId ? opening : null;
  const needsSnapshot = Boolean(unreadViewerId && !snapshot);
  const summary = api.inbox.getConversation.useQuery(
    { conversationId },
    { enabled: needsSnapshot, refetchOnMount: "always", retry: false },
  );
  useEffect(() => {
    if (!needsSnapshot) return;
    if (
      summary.fetchStatus !== "paused" &&
      (!summary.isFetchedAfterMount || summary.isFetching)
    )
      return;
    const latest = summary.data?.lastMessage?.createdAt;
    setOpening({
      conversationId,
      count: summary.data?.unreadCount ?? 0,
      latestAt: latest ? new Date(latest).getTime() : -Infinity,
    });
  }, [
    conversationId,
    needsSnapshot,
    summary.data,
    summary.fetchStatus,
    summary.isFetchedAfterMount,
    summary.isFetching,
  ]);

  const query = api.inbox.getMessages.useQuery(
    messagesQueryInput(conversationId),
    {
      enabled: !needsSnapshot,
      refetchInterval: LIVE_MESSAGES_FALLBACK_MS,
    },
  );
  const latest = query.data?.messages
    .filter((message) => !message.id.startsWith(OPTIMISTIC_MESSAGE_PREFIX))
    .at(-1)?.createdAt;
  const through = needsSnapshot ? undefined : latest?.getTime();
  useEffect(() => {
    if (through !== undefined) markRead?.(conversationId, through);
  }, [conversationId, markRead, through]);
  return {
    ...query,
    isLoading: needsSnapshot || query.isLoading,
    firstUnreadId:
      unreadViewerId && snapshot && query.data
        ? firstUnreadMessage(query.data.messages, snapshot, unreadViewerId)
        : undefined,
  };
}
