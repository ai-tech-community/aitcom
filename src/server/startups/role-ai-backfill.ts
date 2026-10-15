import { and, asc, count, inArray, isNull } from "drizzle-orm";

import { groupRoleAiUpdates } from "@/lib/investigations/job-ai";
import { db } from "@/server/db";
import { startupRoles } from "@/server/db/schema";

/** One cron invocation. A full table walks across later runs. */
export const STARTUP_ROLE_AI_BACKFILL_BATCH = 1000;

export type StartupRoleAiBackfill = {
  updated: number;
  remaining: number;
};

/**
 * Classifies jobs whose `is_ai` is still null, from title and description.
 * A row that is already true or false is skipped, so a second run updates
 * nothing once the nulls are gone. A non-AI reading is stored; the role
 * stays in the table.
 */
export async function backfillStartupRoleAi(
  batch: number = STARTUP_ROLE_AI_BACKFILL_BATCH,
): Promise<StartupRoleAiBackfill> {
  const size = Number.isFinite(batch) && batch > 0 ? Math.floor(batch) : 1;
  const pending = isNull(startupRoles.isAi);
  const rows = await db
    .select({
      id: startupRoles.id,
      title: startupRoles.title,
      descriptionText: startupRoles.descriptionText,
    })
    .from(startupRoles)
    .where(pending)
    .orderBy(asc(startupRoles.id))
    .limit(size);

  if (rows.length === 0) {
    return { updated: 0, remaining: 0 };
  }

  const groups = groupRoleAiUpdates(rows);
  let updated = 0;
  if (groups.ai.length > 0) {
    const written = await db
      .update(startupRoles)
      .set({ isAi: true })
      .where(
        and(inArray(startupRoles.id, groups.ai), isNull(startupRoles.isAi)),
      )
      .returning({ id: startupRoles.id });
    updated += written.length;
  }
  if (groups.notAi.length > 0) {
    const written = await db
      .update(startupRoles)
      .set({ isAi: false })
      .where(
        and(inArray(startupRoles.id, groups.notAi), isNull(startupRoles.isAi)),
      )
      .returning({ id: startupRoles.id });
    updated += written.length;
  }

  const [left] = await db
    .select({ value: count() })
    .from(startupRoles)
    .where(pending);

  return {
    updated,
    remaining: Number(left?.value ?? 0),
  };
}
