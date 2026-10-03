import { and, asc, eq, lt, or, sql } from "drizzle-orm";

import type { db as appDb } from "@/server/db";
import { collectorItems, collectorRuns } from "@/server/db/schema";

import type { AnyCollector, CollectorContext } from "./collector";
import type { ContextMeter } from "./context/collector-context";
import { CollectorStop, userMessageFor } from "./errors";
import { type StopReason, assertTransition } from "./run-status";

export const TICK_BUDGET_MS = 240_000;
export const LEASE_MS = 300_000;
export const MAX_ATTEMPTS = 2;
export const MAX_ITEMS_PER_RUN = 5_000;
const FLUSH_EVERY = 100;
const MAX_LOG_LINES = 50;
const MAX_LOG_LINE = 300;
/** A tick only starts another run while this much of it has passed. */
const START_NEW_RUN_WITHIN_MS = 20_000;

export type CollectorRunRow = typeof collectorRuns.$inferSelect;

export interface ExecutorDeps {
  db: typeof appDb;
  getCollector(id: string): AnyCollector | undefined;
  buildContext(args: {
    collector: AnyCollector;
    signal: AbortSignal;
    deadline: number;
    onLog: (line: string) => void;
  }): Promise<{ ctx: CollectorContext; meter: ContextMeter }>;
  now(): number;
}

type Outcome = {
  status: "succeeded" | "failed";
  stopReason: StopReason;
  error: string | null;
};

/**
 * Take the oldest queued run, or a running one whose lease expired (its
 * worker died). SKIP LOCKED lets concurrent workers each take a different
 * run. Each claim counts as an attempt.
 */
export async function claimNextRun(
  db: typeof appDb,
  now: Date,
): Promise<CollectorRunRow | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: collectorRuns.id })
      .from(collectorRuns)
      .where(
        or(
          eq(collectorRuns.status, "queued"),
          and(
            eq(collectorRuns.status, "running"),
            lt(collectorRuns.leaseUntil, now),
          ),
        ),
      )
      .orderBy(asc(collectorRuns.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx
      .update(collectorRuns)
      .set({
        status: "running",
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        startedAt: now,
        attempts: sql`${collectorRuns.attempts} + 1`,
      })
      .where(eq(collectorRuns.id, next.id))
      .returning();
    return claimed ?? null;
  });
}

function createRunLog() {
  const lines: string[] = [];
  return {
    add: (line: string) => {
      lines.push(line.slice(0, MAX_LOG_LINE));
      if (lines.length > MAX_LOG_LINES) lines.shift();
    },
    lines: () => [...lines],
  };
}

/**
 * Run one claimed Command: resolve the Strategy, give it the Proxy, iterate
 * its rows, validate and store them in batches, then record the outcome.
 * Rows from an earlier attempt are removed first, so a re-run never
 * duplicates. Rows gathered before a stop or failure are kept.
 */
export async function executeRun(
  deps: ExecutorDeps,
  run: CollectorRunRow,
  tickDeadline: number,
): Promise<{ status: "succeeded" | "failed"; stopReason: StopReason }> {
  const startedAt = deps.now();
  const log = createRunLog();

  const finish = async (outcome: Outcome, version?: number) => {
    assertTransition("running", outcome.status);
    await deps.db
      .update(collectorRuns)
      .set({
        status: outcome.status,
        stopReason: outcome.stopReason,
        error: outcome.error,
        durationMs: deps.now() - startedAt,
        finishedAt: new Date(deps.now()),
        leaseUntil: null,
        log: log.lines(),
        ...(version === undefined ? {} : { collectorVersion: version }),
      })
      .where(
        and(eq(collectorRuns.id, run.id), eq(collectorRuns.status, "running")),
      );
    return { status: outcome.status, stopReason: outcome.stopReason };
  };

  if (run.attempts > MAX_ATTEMPTS) {
    await deps.db
      .delete(collectorItems)
      .where(eq(collectorItems.runId, run.id));
    return finish({
      status: "failed",
      stopReason: "worker_lost",
      error: "The run was interrupted twice, so it was stopped.",
    });
  }
  await deps.db.delete(collectorItems).where(eq(collectorItems.runId, run.id));

  const collector = deps.getCollector(run.collectorId);
  if (!collector) {
    return finish({
      status: "failed",
      stopReason: "error",
      error: "This collector is not available any more.",
    });
  }
  const input = collector.inputSchema.safeParse(run.input);
  if (!input.success) {
    return finish(
      {
        status: "failed",
        stopReason: "error",
        error: "The saved input is no longer valid for this collector.",
      },
      collector.version,
    );
  }

  const deadline = Math.min(
    startedAt + collector.limits.maxDurationMs,
    tickDeadline,
  );
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(0, deadline - startedAt),
  );
  const maxItems = Math.min(collector.limits.maxItems, MAX_ITEMS_PER_RUN);
  let meter: ContextMeter = { pagesFetched: 0, bytesFetched: 0 };
  let seq = 0;
  let invalid = 0;
  let buffer: (typeof collectorItems.$inferInsert)[] = [];

  const flush = async () => {
    if (buffer.length) {
      await deps.db.insert(collectorItems).values(buffer);
      buffer = [];
    }
    await deps.db
      .update(collectorRuns)
      .set({
        itemCount: seq,
        invalidItemCount: invalid,
        pagesFetched: meter.pagesFetched,
        bytesFetched: meter.bytesFetched,
        log: log.lines(),
        leaseUntil: new Date(deps.now() + LEASE_MS),
      })
      .where(eq(collectorRuns.id, run.id));
  };

  let outcome: Outcome = {
    status: "succeeded",
    stopReason: "complete",
    error: null,
  };
  try {
    const built = await deps.buildContext({
      collector,
      signal: controller.signal,
      deadline,
      onLog: log.add,
    });
    meter = built.meter;
    for await (const raw of collector.run(input.data, built.ctx)) {
      const row = collector.itemSchema.safeParse(raw);
      if (row.success) {
        buffer.push({
          runId: run.id,
          seq,
          data: row.data as Record<string, unknown>,
        });
        seq += 1;
        if (buffer.length >= FLUSH_EVERY) await flush();
      } else {
        invalid += 1;
      }
      if (seq >= maxItems) {
        outcome = {
          status: "succeeded",
          stopReason: "item_limit",
          error: null,
        };
        break;
      }
      if (controller.signal.aborted) {
        outcome = {
          status: "succeeded",
          stopReason: "time_limit",
          error: null,
        };
        break;
      }
    }
  } catch (err) {
    if (err instanceof CollectorStop) {
      outcome = {
        status: err.outcome,
        stopReason: err.reason,
        error: err.outcome === "failed" ? err.message : null,
      };
    } else {
      console.error(`[collectors] run ${run.id} failed`, err);
      outcome = {
        status: "failed",
        stopReason: "error",
        error: userMessageFor(err),
      };
    }
  } finally {
    clearTimeout(timer);
  }
  await flush();
  return finish(outcome, collector.version);
}

/** One worker invocation: drain queued runs within the tick budget. */
export async function runWorkerTick(
  deps: ExecutorDeps,
): Promise<{ executed: number }> {
  const tickStart = deps.now();
  const tickDeadline = tickStart + TICK_BUDGET_MS;
  let executed = 0;
  while (deps.now() - tickStart < START_NEW_RUN_WITHIN_MS) {
    const run = await claimNextRun(deps.db, new Date(deps.now()));
    if (!run) break;
    await executeRun(deps, run, tickDeadline);
    executed += 1;
  }
  return { executed };
}
