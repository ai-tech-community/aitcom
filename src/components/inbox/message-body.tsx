"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { LinkifiedText } from "@/components/communities/feed/linkified-text";
import { GifPlayer } from "@/components/media/gif-player";
import { isChatUiEnabled } from "@/lib/chat/flags";
import type { MessageAttachmentView } from "@/server/inbox/message-attachments";
import type { RouterOutputs } from "@/trpc/react";
import { UiMessage } from "./ui-message";

type ConversationMessage =
  RouterOutputs["inbox"]["getMessages"]["messages"][number];

type MessageBodyProps = {
  message: ConversationMessage;
  /** The viewer sent this message: their words show as typed. */
  isUser: boolean;
  conversationId: string;
};

/**
 * What a message says and carries, the same in every conversation view:
 * the words first (the viewer's own as text with web links, an app's UI resource as
 * its app, anyone else's as rendered markdown), then each attachment in
 * send order. A message with no words shows no empty text line.
 */
export function MessageBody({
  message,
  isUser,
  conversationId,
}: MessageBodyProps) {
  return (
    <>
      <MessageWords
        message={message}
        isUser={isUser}
        conversationId={conversationId}
      />
      {message.attachments.map((attachment) => (
        <MessageAttachment key={attachment.id} attachment={attachment} />
      ))}
    </>
  );
}

/** One attachment, shown the way its kind is shown. */
function MessageAttachment({
  attachment,
}: {
  attachment: MessageAttachmentView;
}) {
  switch (attachment.kind) {
    case "gif":
      return <GifPlayer gif={attachment} size="message" />;
  }
}

function MessageWords({ message, isUser, conversationId }: MessageBodyProps) {
  if (!isUser && message.uiResource && isChatUiEnabled()) {
    return (
      <UiMessage
        conversationId={conversationId}
        resource={message.uiResource}
        trust={message.uiProducerTrust ?? "member"}
      />
    );
  }
  if (!message.content.trim()) return null;
  if (isUser) {
    return (
      <p>
        <LinkifiedText text={message.content} />
      </p>
    );
  }
  return <MessageResponse>{message.content}</MessageResponse>;
}
