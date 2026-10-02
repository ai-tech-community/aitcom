import { and, eq, sql } from "drizzle-orm";

import type { db as appDb } from "@/server/db";
import { activityEvents } from "@/server/db/schema";

type Tx = Parameters<Parameters<(typeof appDb)["transaction"]>[0]>[0];
type Db = typeof appDb | Tx;

/**
 * The days a member was active, as UTC calendar days (YYYY-MM-DD), sorted
 * ascending and unique. A day counts when the member did at least one thing
 * here (an `activity_event` they acted in as a member).
 *
 * The one source of active days: the dashboard streak and the profile's
 * Activity tab both read it, so a member never sees two different streaks.
 * Only the dates are selected; what the member did stays in the table.
 */
export async function memberActiveDays(
  database: Db,
  userId: string,
): Promise<string[]> {
  const dayExpr = sql<string>`to_char(${activityEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const rows = await database
    .selectDistinct({ day: dayExpr })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.actorId, userId),
        eq(activityEvents.actorType, "member"),
      ),
    )
    .orderBy(dayExpr);
  return rows.map((row) => row.day);
}
