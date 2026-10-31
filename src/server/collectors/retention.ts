import { and, asc, inArray, isNull, lte, ne, or } from "drizzle-orm";
import type { db as appDb } from "@/server/db";
import { collectorRuns } from "@/server/db/schema";

export const RETENTION_BATCH = 25;
/** Expired queued/finished runs and abandoned leases only; never a live worker. */
export function expiredRuns(now: Date) {
  return and(
    lte(collectorRuns.expiresAt, now),
    or(
      ne(collectorRuns.status, "running"),
      isNull(collectorRuns.leaseUntil),
      lte(collectorRuns.leaseUntil, now),
    ),
  );
}
/**
 * Lock one bounded batch, skipping other workers' locks. The FK cascades rows.
 * Claims exclude expired runs; the repeated eligibility check protects races.
 * No result is readable after expiry, even before this next cron tick.
 */
export async function cleanupExpiredRuns(
  db: typeof appDb,
  now: Date,
): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: collectorRuns.id })
      .from(collectorRuns)
      .where(expiredRuns(now))
      .orderBy(asc(collectorRuns.expiresAt), asc(collectorRuns.id))
      .limit(RETENTION_BATCH)
      .for("update", { skipLocked: true });
    if (!rows.length) return 0;
    const deleted = await tx
      .delete(collectorRuns)
      .where(
        and(
          inArray(
            collectorRuns.id,
            rows.map((r) => r.id),
          ),
          expiredRuns(now),
        ),
      )
      .returning({ id: collectorRuns.id });
    return deleted.length;
  });
}
