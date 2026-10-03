import { and, count, eq, gt, inArray } from "drizzle-orm";

import { collectorRuns } from "@/server/db/schema";

import type { CollectorDb } from "./db";
import type { RunStatus } from "./run-status";

export type QuotaLimits = {
  runsPerDay: number;
  activePerUser: number;
  activePlatform: number;
};

/** v1 numbers (spec: "Quota policy"); tuned after launch. */
export const DEFAULT_QUOTA: QuotaLimits = {
  runsPerDay: 20,
  activePerUser: 2,
  activePlatform: 10,
};

export type QuotaDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "daily_limit" | "active_limit" | "platform_busy";
      message: string;
    };

const DAY_MS = 86_400_000;
const ACTIVE = ["queued", "running"] as const satisfies readonly RunStatus[];

/**
 * May this member start one more run? Counted from the database, so it holds
 * across server instances. Agent-started runs count against the owner. Call
 * inside the per-member advisory lock (see `CollectorRuns.startRun`): that
 * lock makes the per-member limits (daily and active) exact, so two
 * simultaneous starts by one member cannot both pass. The platform-wide cap
 * is a soft cap by decision: simultaneous starts by different members hold
 * different locks and can exceed it slightly. Marketplace seam: a plan or
 * credit check slots in here.
 */
export async function canStartRun(
  db: CollectorDb,
  userId: string,
  now: Date,
  limits: QuotaLimits = DEFAULT_QUOTA,
): Promise<QuotaDecision> {
  const since = new Date(now.getTime() - DAY_MS);
  const [recent] = await db
    .select({ n: count() })
    .from(collectorRuns)
    .where(
      and(eq(collectorRuns.userId, userId), gt(collectorRuns.createdAt, since)),
    );
  if ((recent?.n ?? 0) >= limits.runsPerDay) {
    return {
      allowed: false,
      reason: "daily_limit",
      message: `You can start ${limits.runsPerDay} runs per 24 hours. Try again later.`,
    };
  }
  const [mine] = await db
    .select({ n: count() })
    .from(collectorRuns)
    .where(
      and(
        eq(collectorRuns.userId, userId),
        inArray(collectorRuns.status, [...ACTIVE]),
      ),
    );
  if ((mine?.n ?? 0) >= limits.activePerUser) {
    return {
      allowed: false,
      reason: "active_limit",
      message: `You already have ${limits.activePerUser} runs in progress. Wait for one to finish.`,
    };
  }
  const [all] = await db
    .select({ n: count() })
    .from(collectorRuns)
    .where(inArray(collectorRuns.status, [...ACTIVE]));
  if ((all?.n ?? 0) >= limits.activePlatform) {
    return {
      allowed: false,
      reason: "platform_busy",
      message:
        "Data collectors are busy right now. Try again in a few minutes.",
    };
  }
  return { allowed: true };
}
