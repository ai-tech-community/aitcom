import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import { recordTrackMetric } from "@/server/badges/engine";
import { BENCHMARK_COVERAGE_CELLS_SQL } from "@/server/badges/metrics";

type DB = typeof _db;

// Cosmetic recognition for filling under-covered `(prompt, model_surface)`
// cells: the Benchmarker badge track (ADR-0039; tiers and thresholds in
// the badge catalog). Per ADR-0008 decision 4 these are recognition only
// and DO NOT feed back into the contributor weight formula in ADR-0007.
//
// Awarding rule: a contributor is credited with a cell if (a) they have
// at least one run in that `(prompt, model_surface)` and (b) the cell
// meets the public surface threshold (≥3 distinct contributors in the
// 30-day window). This recognises every qualifying contributor rather
// than just whoever happened to be the threshold-crosser, which avoids
// race-driven attribution unfairness.

/**
 * Recomputes the Benchmarker track for all contributors from the current
 * `agg_coverage_by_cell` state, in one counting query, then records the
 * tiers each one reaches through the badge engine. Idempotent; badges are
 * not revoked if a cell drops below threshold later.
 */
export async function recomputeCoverageBadges(db: DB): Promise<void> {
  const rows = await db.execute<{ user_id: string; cell_count: number }>(sql`
    ${BENCHMARK_COVERAGE_CELLS_SQL}
    GROUP BY r.submitted_by_user_id
  `);

  for (const row of rows.rows) {
    if (!row.user_id) continue;
    await recordTrackMetric(
      db,
      row.user_id,
      "benchmarker",
      Number(row.cell_count),
    );
  }
}
