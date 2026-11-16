"use client";

import { useCallback } from "react";
import { useMutation } from "@tanstack/react-query";

import type { PickedGif } from "@/components/composer/gif-picker-button";
import { authClient } from "@/server/better-auth/client";
import type { MessageAttachmentView } from "@/server/inbox/message-attachments";
import { api } from "@/trpc/react";

import { messagesQueryInput } from "./conversation-messages";

/** What the member wrote: words, a GIF, or both. */
export type MessageDraft = { content: string; gif?: PickedGif | null };

/** One send as the mutation runs it: the trimmed draft and where it goes. */
type Sending = {
  conversationId: string;
  content: string;
  gif: PickedGif | null;
};

/** The picked GIF as the message shows it until the server's copy arrives. */
function optimisticAttachments(gif: PickedGif | null): MessageAttachmentView[] {
  if (!gif) return [];
  return [
    {
      id: "optimistic-gif",
      kind: "gif",
      position: 0,
      title: gif.title,
      mp4Url: gif.mp4Url,
      stillUrl: gif.stillUrl,
      width: gif.width,
      height: gif.height,
    },
  ];
}

/**
 * Sends a message in one conversation. The member's own message shows at
 * once (optimistic, ADR-0025 Tier 0) and is taken back if the send fails.
 * `send` trims the words and does nothing when neither words nor a GIF
 * are left; it rejects when the send fails.
 *
 * The mutation's variables are the whole draft, not the wire input, so
 * the optimistic message can show the picked GIF; only its id goes to the
 * server, which reads the GIF from GIPHY again.
 */
export function useSendMessage(conversationId: string): {
  send: (draft: MessageDraft) => Promise<void>;
  isPending: boolean;
} {
  const { data: session } = authClient.useSession();
  const utils = api.useUtils();
  const currentUserId = session?.user?.id;

  const sendMessage = useMutation({
    mutationFn: ({ conversationId, content, gif }: Sending) =>
      utils.client.inbox.sendMessage.mutate({
        conversationId,
        content,
        gif: gif ? { giphyId: gif.giphyId } : undefined,
      }),
    // The conversation comes from the mutation's own variables, not from
    // this render: a send that settles after the view moved to another
    // conversation must still touch only its own conversation's messages.
    onMutate: async ({ conversationId, content, gif }) => {
      if (!currentUserId) return;
      const key = messagesQueryInput(conversationId);
      await utils.inbox.getMessages.cancel(key);
      const previous = utils.inbox.getMessages.getData(key);
      utils.inbox.getMessages.setData(key, (old) => {
        if (!old) return old;
        const optimistic: (typeof old.messages)[number] = {
          id: `optimistic-${Date.now()}`,
          conversationId,
          senderId: currentUserId,
          senderType: "human",
          content,
          metadata: null,
          uiResource: null,
          uiProducerTrust: null,
          createdAt: new Date(),
          attachments: optimisticAttachments(gif),
        };
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
    async ({ content, gif = null }: MessageDraft) => {
      const text = content.trim();
      if (!text && !gif) return;
      await mutateAsync({ conversationId, content: text, gif });
    },
    [conversationId, mutateAsync],
  );

  return { send, isPending: sendMessage.isPending };
}
