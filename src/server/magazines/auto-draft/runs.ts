import { sql as payloadSql } from "@payloadcms/db-postgres";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import { AFTER_EVENT_LOOK_BACK_DAYS } from "@/lib/magazines/auto-draft";
import type {
  AutoDraftSkipReason,
  AutoDraftTrigger,
} from "@/lib/magazines/issue-history";
import type { MagazineIssue } from "@/payload-types";
import { magazineAutoDraftRuns } from "@/server/db/schema";

import type { Deps } from "../deps";
import { endedCommunityEvents } from "../items/event/suggest";
import type { ItemCommunity } from "../items/types";
import type { PayloadTransaction } from "../payload-writes";

/** Any run can hold an open issue, including a crashed or failed attempt. */
export async function findOpenAutoDraft(
  deps: Deps,
  magazineId: number,
): Promise<MagazineIssue | null> {
  const [run] = await deps.db
    .select({ issueId: magazineAutoDraftRuns.issueId })
    .from(magazineAutoDraftRuns)
    .innerJoin(
      sql`"public"."magazine_issues" AS "issue"`,
      sql`"issue"."id" = ${magazineAutoDraftRuns.issueId}
        AND "issue"."status" IN ('draft', 'scheduled')`,
    )
    .where(eq(magazineAutoDraftRuns.magazineId, magazineId))
    .orderBy(
      desc(magazineAutoDraftRuns.claimedAt),
      desc(magazineAutoDraftRuns.id),
    )
    .limit(1);
  if (run?.issueId == null) return null;
  return deps.payload.findByID({
    collection: "magazine-issues",
    id: run.issueId,
    depth: 0,
    disableErrors: true,
  });
}

export const RUN_STALE_MINUTES = 15;
export const AUTO_DRAFT_MAX_ATTEMPTS = 3;
export type RunClaim =
  | { runId: string; leftoverIssueId: number | null }
  | { refused: "already_ran" | "busy" };

/** Both unique indexes participate: the period, and one running row per magazine. */
export async function claimAutoDraftRun(
  db: Deps["db"],
  input: {
    magazineId: number;
    periodKey: string;
    trigger: AutoDraftTrigger;
    requestedBy: string | null;
    now: Date;
  },
): Promise<RunClaim> {
  const { now, ...identity } = input;
  await db
    .update(magazineAutoDraftRuns)
    .set({ status: "failed", finishedAt: now })
    .where(
      and(
        eq(magazineAutoDraftRuns.magazineId, input.magazineId),
        eq(magazineAutoDraftRuns.status, "running"),
        lt(
          magazineAutoDraftRuns.claimedAt,
          new Date(now.getTime() - RUN_STALE_MINUTES * 60_000),
        ),
      ),
    );
  const [inserted] = await db
    .insert(magazineAutoDraftRuns)
    .values({ ...identity, status: "running", claimedAt: now })
    .onConflictDoNothing()
    .returning({ id: magazineAutoDraftRuns.id });
  if (inserted) return { runId: inserted.id, leftoverIssueId: null };
  try {
    const [reclaimed] = await db
      .update(magazineAutoDraftRuns)
      .set({
        status: "running",
        attempts: sql`${magazineAutoDraftRuns.attempts} + 1`,
        claimedAt: now,
        finishedAt: null,
        skipReason: null,
        foundCount: null,
        trigger: input.trigger,
        requestedBy: input.requestedBy,
      })
      .where(
        and(
          eq(magazineAutoDraftRuns.magazineId, input.magazineId),
          eq(magazineAutoDraftRuns.periodKey, input.periodKey),
          eq(magazineAutoDraftRuns.status, "failed"),
          lt(magazineAutoDraftRuns.attempts, AUTO_DRAFT_MAX_ATTEMPTS),
        ),
      )
      .returning({
        id: magazineAutoDraftRuns.id,
        issueId: magazineAutoDraftRuns.issueId,
      });
    if (reclaimed)
      return { runId: reclaimed.id, leftoverIssueId: reclaimed.issueId };
  } catch (error) {
    // Drizzle wraps the driver's unique violation as a cause.
    let cause: unknown = error;
    for (let depth = 0; cause && depth < 5; depth++) {
      if ((cause as { code?: string }).code === "23505")
        return { refused: "busy" };
      cause = (cause as { cause?: unknown }).cause;
    }
    throw error;
  }
  const [period] = await db
    .select({ status: magazineAutoDraftRuns.status })
    .from(magazineAutoDraftRuns)
    .where(
      and(
        eq(magazineAutoDraftRuns.magazineId, input.magazineId),
        eq(magazineAutoDraftRuns.periodKey, input.periodKey),
      ),
    )
    .limit(1);
  return {
    refused: period && period.status !== "running" ? "already_ran" : "busy",
  };
}

/** Record the issue and its write time on the issue transaction's connection. */
export async function attachRunIssue(
  tx: PayloadTransaction,
  runId: string,
  issueId: number,
  updatedAt: string,
): Promise<void> {
  await tx.execute(payloadSql`
    UPDATE "app"."magazine_auto_draft_run"
    SET "issue_id" = ${issueId}, "last_write_at" = ${new Date(updatedAt)}
    WHERE "id" = ${runId}
  `);
}

/** Failed leftovers are recovered under the new claim's per-magazine lock. */
export async function failedRunIssues(
  db: Deps["db"],
  magazineId: number,
  claimedRunId: string,
) {
  return db
    .select({
      id: magazineAutoDraftRuns.id,
      issueId: magazineAutoDraftRuns.issueId,
      lastWriteAt: magazineAutoDraftRuns.lastWriteAt,
    })
    .from(magazineAutoDraftRuns)
    .where(
      and(
        eq(magazineAutoDraftRuns.magazineId, magazineId),
        isNotNull(magazineAutoDraftRuns.issueId),
        or(
          eq(magazineAutoDraftRuns.status, "failed"),
          eq(magazineAutoDraftRuns.id, claimedRunId),
        ),
      ),
    );
}

/** Detach a removed issue even when its Payload foreign key was already cleared. */
export async function clearRunIssue(
  db: Deps["db"],
  runId: string,
): Promise<void> {
  await db
    .update(magazineAutoDraftRuns)
    .set({ issueId: null, lastWriteAt: null })
    .where(eq(magazineAutoDraftRuns.id, runId));
}

/** One batched finished-period read, before any magazine/community hydration. */
export async function finishedCalendarPeriods(
  db: Deps["db"],
  periods: readonly { magazineId: number; periodKey: string }[],
): Promise<Set<string>> {
  if (periods.length === 0) return new Set();
  const rows = await db
    .select({
      magazineId: magazineAutoDraftRuns.magazineId,
      periodKey: magazineAutoDraftRuns.periodKey,
    })
    .from(magazineAutoDraftRuns)
    .where(
      and(
        or(
          ...periods.map(({ magazineId, periodKey }) =>
            and(
              eq(magazineAutoDraftRuns.magazineId, magazineId),
              eq(magazineAutoDraftRuns.periodKey, periodKey),
            ),
          ),
        ),
        finishedRunCondition(),
      ),
    );
  return new Set(rows.map((row) => `${row.magazineId}:${row.periodKey}`));
}

function finishedRunCondition() {
  return or(
    inArray(magazineAutoDraftRuns.status, ["made", "skipped"]),
    and(
      eq(magazineAutoDraftRuns.status, "failed"),
      gte(magazineAutoDraftRuns.attempts, AUTO_DRAFT_MAX_ATTEMPTS),
    ),
  );
}

/** The one definition of an issue made automatically. */
export async function isAutoMadeIssue(
  db: Deps["db"],
  issueId: number,
): Promise<boolean> {
  const [run] = await db
    .select({ id: magazineAutoDraftRuns.id })
    .from(magazineAutoDraftRuns)
    .where(
      and(
        eq(magazineAutoDraftRuns.issueId, issueId),
        eq(magazineAutoDraftRuns.status, "made"),
      ),
    )
    .limit(1);
  return run !== undefined;
}

export async function finishedPeriodKeys(
  db: Deps["db"],
  magazineId: number,
  periodKeys: readonly string[],
): Promise<Set<string>> {
  if (periodKeys.length === 0) return new Set();
  const rows = await db
    .select({ key: magazineAutoDraftRuns.periodKey })
    .from(magazineAutoDraftRuns)
    .where(
      and(
        eq(magazineAutoDraftRuns.magazineId, magazineId),
        inArray(magazineAutoDraftRuns.periodKey, [...periodKeys]),
        finishedRunCondition(),
      ),
    );
  return new Set(rows.map((row) => row.key));
}

export async function finishAutoDraftRun(
  db: Deps["db"],
  runId: string,
  result:
    | { status: "made"; issueId: number }
    | { status: "skipped"; reason: AutoDraftSkipReason; found: number | null }
    | { status: "failed" },
  now: Date,
): Promise<void> {
  await db
    .update(magazineAutoDraftRuns)
    .set({
      status: result.status,
      finishedAt: now,
      ...(result.status === "made" ? { issueId: result.issueId } : {}),
      ...(result.status === "skipped"
        ? { skipReason: result.reason, foundCount: result.found }
        : {}),
    })
    .where(eq(magazineAutoDraftRuns.id, runId));
}

/** Reuse the event kind's UTC day rule, oldest ended event first. */
export async function pendingEventPeriods(
  deps: Deps,
  input: {
    magazineId: number;
    community: ItemCommunity;
    scheduleStartsAt: Date;
    now: Date;
  },
): Promise<string[]> {
  const since = new Date(
    Math.max(
      input.now.getTime() - AFTER_EVENT_LOOK_BACK_DAYS * 86_400_000,
      input.scheduleStartsAt.getTime(),
    ),
  );
  const events = await endedCommunityEvents(
    deps,
    input.community,
    since,
    input.now,
  );
  const keys = events.map((event) => `event:${event.id}`);
  const finished = await finishedPeriodKeys(deps.db, input.magazineId, keys);
  return keys.filter((key) => !finished.has(key));
}
