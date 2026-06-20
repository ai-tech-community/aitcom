import { and, eq, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  conversations,
  conversationParticipants,
  messages,
} from "@/server/db/schema";
import { publishInboxEvent } from "@/server/inbox/publish";

type DB = typeof _db;

/** Send a direct message from one user to another, reusing an existing DM
 *  conversation if one exists (mirrors the inbox.startConversation dedup). No
 *  transaction — claim/dedup pattern only. Returns the conversation id. */
export async function sendDirectMessage(
  db: DB,
  fromUserId: string,
  toUserId: string,
  content: string,
): Promise<string> {
  const [existing] = await db
    .select({ conversationId: conversationParticipants.conversationId })
    .from(conversationParticipants)
    .innerJoin(
      conversations,
      eq(conversations.id, conversationParticipants.conversationId),
    )
    .where(
      and(
        eq(conversations.type, "dm"),
        eq(conversationParticipants.userId, toUserId),
        sql`${conversationParticipants.conversationId} IN (
          SELECT ${conversationParticipants.conversationId} FROM ${conversationParticipants} WHERE ${conversationParticipants.userId} = ${fromUserId}
        )`,
      ),
    )
    .limit(1);

  let conversationId = existing?.conversationId;
  if (!conversationId) {
    const [conv] = await db
      .insert(conversations)
      .values({ type: "dm" })
      .returning();
    await db.insert(conversationParticipants).values([
      { conversationId: conv!.id, userId: fromUserId },
      { conversationId: conv!.id, userId: toUserId },
    ]);
    conversationId = conv!.id;
  }
  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId: fromUserId,
      senderType: "human",
      content,
    })
    .returning();
  // Best-effort, fire-and-forget (consistent with the inbox router paths);
  // publishInboxEvent swallows errors internally so it never blocks/breaks send.
  void publishInboxEvent(toUserId, {
    kind: "message",
    conversationId,
    message,
  });
  return conversationId;
}
