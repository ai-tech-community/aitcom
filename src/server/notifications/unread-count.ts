import { and, eq, isNull, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import { notifications } from "@/server/db/schema";

type DB = typeof _db;

/** How many of the member's notifications are still unread (the bell badge). */
export async function countUnreadNotifications(
  db: DB,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}
