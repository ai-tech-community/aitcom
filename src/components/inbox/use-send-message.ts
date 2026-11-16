"use client";

import { useCallback } from "react";

import { authClient } from "@/server/better-auth/client";
import { api } from "@/trpc/react";

import { messagesQueryInput } from "./conversation-messages";

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
    // The conversation comes from the mutation's own input, not from this
    // render: a send that settles after the view moved to another
    // conversation must still touch only its own conversation's messages.
    onMutate: async ({ conversationId, content }) => {
      if (!currentUserId) return;
      const key = messagesQueryInput(conversationId);
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
    onError: (_err, { conversationId }, ctx) => {
      if (ctx?.previous) {
        utils.inbox.getMessages.setData(
          messagesQueryInput(conversationId),
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
