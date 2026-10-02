import { sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  conversationParticipants,
  conversations,
  messages,
  spaceMemberships,
} from "@/server/db/schema";

type DB = typeof _db;

/**
 * Unread messages across all of the member's conversations (the inbox badge).
 *
 * Two unread sources, UNION ALL'd then summed: DM/agent conversations
 * (tracked on conversationParticipants) and room conversations (no
 * participant rows — tracked on the member's active spaceMembership, the
 * same marker getMessages/listConversations use). Without the room arm the
 * global badge silently undercounts room unread.
 */
export async function countInboxUnread(
  db: DB,
  userId: string,
): Promise<number> {
  const [result] = await db
    .select({ total: sql<number>`coalesce(sum(sub.cnt), 0)::int` })
    .from(
      sql`(
        SELECT count(*) as cnt
        FROM ${messages} m
        JOIN ${conversationParticipants} cp
          ON cp.conversation_id = m.conversation_id
        WHERE cp.user_id = ${userId}
          AND (m.sender_id != ${userId} OR m.sender_type != 'human')
          AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
        GROUP BY m.conversation_id

        UNION ALL

        SELECT count(*) as cnt
        FROM ${messages} m
        JOIN ${conversations} c
          ON c.id = m.conversation_id AND c.type = 'space'
        JOIN ${spaceMemberships} sm
          ON sm.space_id = c.space_id
          AND sm.user_id = ${userId}
          AND sm.status = 'active'
        WHERE (m.sender_id != ${userId} OR m.sender_type != 'human')
          AND (sm.last_read_at IS NULL OR m.created_at > sm.last_read_at)
        GROUP BY m.conversation_id
      ) sub`,
    );
  return result?.total ?? 0;
}
