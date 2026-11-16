import type { db as Database } from "@/server/db";
import { messageAttachments, messages } from "@/server/db/schema";
import { resolveProducerTrust } from "@/lib/chat/trust";
import type { UiResource } from "@/lib/chat/types";
import type { StoredGif } from "@/server/giphy/gif-lookup";
import {
  attachmentViews,
  type MessageAttachmentView,
} from "@/server/inbox/message-attachments";

type Db = typeof Database;

export type MemberMessageInput = {
  conversationId: string;
  senderId: string;
  content: string;
  uiResource?: UiResource;
  /** A GIF already looked up from GIPHY by id; never one the client sent. */
  gif: StoredGif | null;
};

export type MemberMessage = typeof messages.$inferSelect & {
  attachments: MessageAttachmentView[];
};

/**
 * Stores a message a member sent, with what it carries, in one
 * transaction: a reader never sees the message without its attachments.
 */
export async function insertMemberMessage(
  db: Db,
  input: MemberMessageInput,
): Promise<MemberMessage> {
  return db.transaction(async (tx) => {
    const [message] = await tx
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        senderId: input.senderId,
        senderType: "human",
        content: input.content,
        uiResource: input.uiResource,
        uiProducerTrust: input.uiResource
          ? resolveProducerTrust({ kind: "member" })
          : undefined,
      })
      .returning();

    const attachmentRows = input.gif
      ? await tx
          .insert(messageAttachments)
          .values({
            messageId: message!.id,
            position: 0,
            kind: "gif",
            giphyId: input.gif.giphyId,
            title: input.gif.title,
            mp4Url: input.gif.mp4Url,
            stillUrl: input.gif.stillUrl,
            width: input.gif.width,
            height: input.gif.height,
          })
          .returning()
      : [];

    return { ...message!, attachments: attachmentViews(attachmentRows) };
  });
}
