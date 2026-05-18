import { eq, sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import { benchmarkRuns } from "@/server/db/schema";
import { computeContributorWeight } from "./contributor-weight";

type DB = typeof _db;

/**
 * Legacy helper kept for tests that exercise the pre-BYOA agreement
 * formula. Not called by the cron under the BYOA model — see
 * {@link recomputeRunWeights} below.
 */
export function computeBrandWeight(args: {
  agreementCount: number;
  medianAgreement: number;
}): number {
  if (args.medianAgreement <= 0) return 1.0;
  return Math.min(1.0, args.agreementCount / args.medianAgreement);
}

/**
 * Periodic refresh of `benchmark_run.weight` for recent runs, using the
 * **inherited contributor standing** from ADR-0007 decision 1. We do not
 * derive weight from cross-contributor agreement under BYOA — that path
 * was rejected because the benchmark should not run a private reputation
 * loop on top of submissions.
 *
 * What this refresh buys us: contributors whose AIT profile improves
 * over time (account age crosses a tier, new badges earned, onboarding
 * completed) have their recent runs upgraded to match. Without it,
 * weight stays frozen at submit-time forever.
 *
 * The pure formula lives in `computeContributorWeightFromInputs`; this
 * cron just re-applies it per active contributor.
 */
export async function recomputeRunWeights(db: DB): Promise<void> {
  const recentContributors = await db
    .selectDistinct({ userId: benchmarkRuns.submittedByUserId })
    .from(benchmarkRuns)
    .where(sql`${benchmarkRuns.capturedAt} >= now() - INTERVAL '30 days'`);

  for (const row of recentContributors) {
    if (!row.userId) continue;
    const weight = await computeContributorWeight(db, row.userId);
    await db
      .update(benchmarkRuns)
      .set({ weight: weight.toString() })
      .where(
        sql`${benchmarkRuns.submittedByUserId} = ${row.userId}
            AND ${benchmarkRuns.capturedAt} >= now() - INTERVAL '30 days'`,
      );
  }
}
