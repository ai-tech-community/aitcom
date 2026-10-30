import { and, eq, sql } from "drizzle-orm";
import {
  MAX_READING_SECONDS,
  READING_REPORT_SECONDS,
  type ReadingTimeInput,
} from "@/lib/magazines/reading-time";
import { magazineReadingSessions as sessions } from "@/server/db/schema";
import type { Deps } from "../deps";
import { loadRecordablePage } from "./record";

/** Cumulative reports replace a session's tally; retries never add time twice. */
export async function recordReadingTimeFor(
  deps: Deps,
  input: ReadingTimeInput & { viewerId: string | null; now: Date },
): Promise<boolean> {
  const issue = await loadRecordablePage(deps, {
    issueId: input.issueId,
    articleId: input.articleId ?? null,
    viewerId: input.viewerId,
    event: "view",
  });
  if (!issue?.magazineId) return false;
  await deps.db
    .insert(sessions)
    .values({
      id: input.sessionId,
      magazineId: issue.magazineId,
      issueId: issue.id,
      articleId: input.articleId ?? null,
      activeSeconds: Math.min(input.activeSeconds, READING_REPORT_SECONDS),
      firstSeenAt: input.now,
      lastSeenAt: input.now,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        activeSeconds: sql`GREATEST(${sessions.activeSeconds}, LEAST(${input.activeSeconds}, ${MAX_READING_SECONDS},
        ${READING_REPORT_SECONDS} + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (${input.now.toISOString()}::timestamptz - ${sessions.firstSeenAt}))))))`,
        lastSeenAt: sql`GREATEST(${sessions.lastSeenAt}, ${input.now.toISOString()}::timestamptz)`,
      },
      setWhere: and(
        eq(sessions.magazineId, issue.magazineId),
        eq(sessions.issueId, issue.id),
        sql`${sessions.articleId} IS NOT DISTINCT FROM ${input.articleId ?? null}`,
      ),
    });
  return true;
}
