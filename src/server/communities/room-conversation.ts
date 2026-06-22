import { and, eq } from "drizzle-orm";

import type { db as Database } from "@/server/db";
import { conversations } from "@/server/db/schema";

/**
 * Return the id of the room's space-conversation, creating it on first use.
 * One conversation per space (type='space', spaceId set).
 */
export async function getOrCreateRoomConversation(
  db: typeof Database,
  spaceId: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(eq(conversations.type, "space"), eq(conversations.spaceId, spaceId)),
    )
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(conversations)
    .values({ type: "space", spaceId })
    .returning({ id: conversations.id });
  return created!.id;
}
