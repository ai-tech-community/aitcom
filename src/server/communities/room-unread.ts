import { and, eq, ne, or, sql } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { messages } from "@/server/db/schema";

/**
 * Count unread messages in a room conversation for a viewer: messages created
 * after `lastReadAt` (all of them when `lastReadAt` is null / never opened) that
 * the viewer didn't author as a human. Mirrors DM unread semantics so room
 * badges behave identically to direct-message badges.
 */
export async function countRoomUnread(
  database: typeof Db,
  conversationId: string,
  userId: string,
  lastReadAt: Date | null,
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        lastReadAt ? sql`${messages.createdAt} > ${lastReadAt}` : sql`true`,
        or(ne(messages.senderId, userId), ne(messages.senderType, "human")),
      ),
    );
  return row?.count ?? 0;
}
