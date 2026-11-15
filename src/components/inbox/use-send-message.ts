"use client";

import { useCallback } from "react";

import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

/**
 * How many messages a conversation view loads. Every `inbox.getMessages`
 * read uses it, so they share one cache entry, the one the optimistic row
 * is written to.
 */
export const MESSAGES_PAGE_SIZE = 50;

/**
 * Sends a message in one conversation. The member's own message shows at
 * once (optimistic, ADR-0025 Tier 0) and is taken back if the send fails.
 * `send` trims the text and does nothing when none is left; it rejects when
 * the send fails.
 */
export function useSendMessage(conversationId: string): {
  send: (content: string) => Promise<void>;
  isPending: boolean;
} {
  const { data: session } = authClient.useSession();
  const utils = api.useUtils();
  const currentUserId = session?.user?.id;

  const sendMessage = api.inbox.sendMessage.useMutation({
    onMutate: async ({ content }) => {
      if (!currentUserId) return;
      const key = { conversationId, limit: MESSAGES_PAGE_SIZE };
      await utils.inbox.getMessages.cancel(key);
      const previous = utils.inbox.getMessages.getData(key);
      utils.inbox.getMessages.setData(key, (old) => {
        if (!old) return old;
        const optimistic = {
          id: `optimistic-${Date.now()}`,
          senderId: currentUserId,
          senderType: "human" as const,
          content,
          createdAt: new Date(),
        } as (typeof old.messages)[number];
        return { ...old, messages: [...old.messages, optimistic] };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        utils.inbox.getMessages.setData(
          { conversationId, limit: MESSAGES_PAGE_SIZE },
          ctx.previous,
        );
      }
    },
    onSettled: () => {
      void utils.inbox.getMessages.invalidate();
      void utils.inbox.listConversations.invalidate();
      void utils.inbox.totalUnreadCount.invalidate();
    },
  });

  const { mutateAsync } = sendMessage;
  const send = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text) return;
      await mutateAsync({ conversationId, content: text });
    },
    [conversationId, mutateAsync],
  );

  return { send, isPending: sendMessage.isPending };
}
