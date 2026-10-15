import { and, asc, count, inArray, isNull, lte } from "drizzle-orm";

import { db } from "@/server/db";
import { startups } from "@/server/db/schema";

/**
 * Rows listed on or before this date were in the AI-only directory.
 * The cron marks those still-null rows as uses AI. Later rows stay null
 * until a write records the flag. Re-running updates nothing once the
 * nulls in this window are gone.
 */
export const STARTUP_USES_AI_BACKFILL_THROUGH = "2026-10-15";

/** One cron invocation. A full table walks across later runs. */
export const STARTUP_USES_AI_BACKFILL_BATCH = 1000;

export type StartupUsesAiBackfill = {
  updated: number;
  remaining: number;
};

export async function backfillStartupUsesAi(
  batch: number = STARTUP_USES_AI_BACKFILL_BATCH,
): Promise<StartupUsesAiBackfill> {
  const size = Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1;
  const pending = and(
    isNull(startups.usesAi),
    lte(startups.listedOn, STARTUP_USES_AI_BACKFILL_THROUGH),
  );
  const ids = await db
    .select({ id: startups.id })
    .from(startups)
    .where(pending)
    .orderBy(asc(startups.id))
    .limit(size);

  if (ids.length === 0) {
    return { updated: 0, remaining: 0 };
  }

  const updated = await db
    .update(startups)
    .set({ usesAi: true })
    .where(
      inArray(
        startups.id,
        ids.map((row) => row.id),
      ),
    )
    .returning({ id: startups.id });

  const [left] = await db
    .select({ value: count() })
    .from(startups)
    .where(pending);

  return {
    updated: updated.length,
    remaining: Number(left?.value ?? 0),
  };
}

/** Test seam: the predicate the cron uses. Listed-on is inclusive. */
export function startupListedDuringAiOnlyDirectory(listedOn: string): boolean {
  return listedOn <= STARTUP_USES_AI_BACKFILL_THROUGH;
}
