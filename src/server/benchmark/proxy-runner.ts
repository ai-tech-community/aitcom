import type { ModelSurface } from "@/server/db/schema";

import type {
  NormalizedSource,
  ProxyRunInput,
  ProxyRunResult,
} from "./proxy/types";
import { ProxyError } from "./proxy/types";

/**
 * A queued benchmark_run row joined with its prompt. The adapter is responsible
 * for performing the join (benchmark_run -> benchmark_prompt) and producing
 * this shape so the runner can call the proxy with the prompt text directly.
 */
export interface QueuedRunRow {
  runId: string;
  promptId: string;
  promptText: string;
  locale: string;
  modelSurface: ModelSurface;
}

/**
 * Database operations the runner needs. The Drizzle adapter implements this;
 * tests provide a fake. Keeping it minimal keeps the test surface small.
 */
export interface ProxyRunnerDb {
  /**
   * Move rows in 'running' state older than `staleAfterMs` back to 'queued' so
   * a previous crashed tick doesn't strand work forever. Returns the number of
   * rows recovered.
   */
  recoverStuckRunning(staleAfterMs: number): Promise<number>;

  /**
   * Total cost_cents spent today (UTC) per surface for rows in 'done' state.
   * Surfaces with no spend yet should be absent from the map (or zero).
   */
  spentTodayBySurface(): Promise<Map<ModelSurface, number>>;

  /**
   * Atomically claim up to `limit` queued rows for the given surfaces, setting
   * their proxy_status to 'running' and returning them. Implementations must
   * use SELECT ... FOR UPDATE SKIP LOCKED (or equivalent) to be safe under
   * concurrent ticks.
   */
  claimQueued(
    surfaces: readonly ModelSurface[],
    limit: number,
  ): Promise<QueuedRunRow[]>;

  /**
   * Persist a successful proxy run: update the benchmark_run row with the
   * proxy response fields, set proxy_status='done', set extraction_status to
   * 'pending' so the downstream extractor picks it up, and insert the
   * normalized sources.
   */
  markSuccess(runId: string, result: ProxyRunResult): Promise<void>;

  /**
   * Persist a failed proxy run: set proxy_status='failed' and record the
   * error reason in proxy_response_raw as `{ error: string }`.
   */
  markFailure(runId: string, error: string): Promise<void>;
}

export interface RunOnSurfaceFn {
  (surface: ModelSurface, input: ProxyRunInput): Promise<ProxyRunResult>;
}

export interface ProxyRunnerOptions {
  /** Max rows to claim per tick. Default 5. */
  batchSize?: number;
  /** Daily spend cap in cents per surface; absent surface = no cap. */
  budgetCentsBySurface?: Partial<Record<ModelSurface, number>>;
  /** Surfaces the runner is allowed to claim from. */
  enabledSurfaces: readonly ModelSurface[];
  /** Recover rows stuck in 'running' older than this many ms. Default 10 min. */
  recoverStuckAfterMs?: number;
}

export interface ProxyRunnerTickResult {
  recovered: number;
  processed: number;
  failed: number;
  skippedSurfaces: ModelSurface[];
}

/**
 * Determine which surfaces still have budget remaining today.
 *
 * Pure function for testability. A surface with no budget configured is always
 * eligible. A surface with a budget is eligible only when today's spend is
 * strictly below it.
 */
export function decideEligibleSurfaces(
  enabledSurfaces: readonly ModelSurface[],
  spentBySurface: Map<ModelSurface, number>,
  budgetBySurface: Partial<Record<ModelSurface, number>> | undefined,
): { eligible: ModelSurface[]; skipped: ModelSurface[] } {
  const eligible: ModelSurface[] = [];
  const skipped: ModelSurface[] = [];
  for (const surface of enabledSurfaces) {
    const budget = budgetBySurface?.[surface];
    const spent = spentBySurface.get(surface) ?? 0;
    if (typeof budget === "number" && spent >= budget) {
      skipped.push(surface);
    } else {
      eligible.push(surface);
    }
  }
  return { eligible, skipped };
}

/**
 * Process the next batch of queued runs. Designed to be called from a cron
 * tick. Per-row failures are caught and recorded; only an adapter-level
 * failure (e.g. database down) should escape this function.
 */
export async function runProxyRunnerTick(
  db: ProxyRunnerDb,
  runOnSurface: RunOnSurfaceFn,
  options: ProxyRunnerOptions,
): Promise<ProxyRunnerTickResult> {
  const batchSize = options.batchSize ?? 5;
  const recoverStuckAfterMs = options.recoverStuckAfterMs ?? 10 * 60 * 1000;

  const recovered = await db.recoverStuckRunning(recoverStuckAfterMs);

  const spent = await db.spentTodayBySurface();
  const { eligible, skipped } = decideEligibleSurfaces(
    options.enabledSurfaces,
    spent,
    options.budgetCentsBySurface,
  );

  if (eligible.length === 0) {
    return { recovered, processed: 0, failed: 0, skippedSurfaces: skipped };
  }

  const claimed = await db.claimQueued(eligible, batchSize);

  let processed = 0;
  let failed = 0;
  for (const row of claimed) {
    try {
      const result = await runOnSurface(row.modelSurface, {
        prompt: row.promptText,
        locale: row.locale,
      });
      await db.markSuccess(row.runId, result);
      processed += 1;
    } catch (err) {
      const message =
        err instanceof ProxyError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      await db.markFailure(row.runId, message);
      failed += 1;
    }
  }

  return { recovered, processed, failed, skippedSurfaces: skipped };
}

/**
 * Re-exported so callers wiring up the runner don't have to import from a
 * second module.
 */
export type { NormalizedSource, ProxyRunInput, ProxyRunResult };
