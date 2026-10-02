import { and, eq, sql } from "drizzle-orm";

import type { db as Db } from "@/server/db";
import { eventRegistrations } from "@/server/db/schema";

/**
 * Whether the event now has exactly one checked-in registration: the
 * check-in just made is its first, so the event has just taken place.
 * One indexed count, so a check-in desk stays fast.
 */
export async function isFirstCheckIn(
  db: typeof Db,
  eventId: number,
): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.status, "attended"),
      ),
    );
  return Number(row?.n ?? 0) === 1;
}
