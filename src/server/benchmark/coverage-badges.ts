import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

// Cosmetic recognition badges awarded for filling under-covered
// `(prompt, model_surface)` cells. Per ADR-0008 decision 4: these are
// recognition only and DO NOT feed back into the contributor weight
// formula in ADR-0007. The thresholds are tunable; the slugs are stable
// because they live in `member_badge` rows.
//
// Awarding rule: a contributor is credited with a cell if (a) they have
// at least one run in that `(prompt, model_surface)` and (b) the cell
// meets the public surface threshold (≥3 distinct contributors in the
// 30-day window). This recognises every qualifying contributor rather
// than just whoever happened to be the threshold-crosser, which avoids
// race-driven attribution unfairness.

export const COVERAGE_BADGE_TIERS = [
  { slug: "benchmark-coverage-first", minCells: 1 },
  { slug: "benchmark-coverage-10", minCells: 10 },
  { slug: "benchmark-coverage-50", minCells: 50 },
] as const;

export type CoverageBadgeSlug = (typeof COVERAGE_BADGE_TIERS)[number]["slug"];

/**
 * Recomputes cosmetic coverage badges for all contributors based on
 * current `agg_coverage_by_cell` state. Idempotent — the unique index
 * on `member_badge(user_id, badge_slug)` prevents duplicates. Badges
 * are not revoked if a cell drops below threshold later; once earned,
 * they stay (matching the typical badge convention).
 */
export async function recomputeCoverageBadges(db: DB): Promise<void> {
  // Count qualifying cells per contributor in one query. `30` matches
  // the public-display window the coverage map and visibility
  // aggregates use; align with that here for consistency.
  const rows = await db.execute<{ user_id: string; cell_count: number }>(sql`
    SELECT
      r.submitted_by_user_id AS user_id,
      COUNT(DISTINCT (r.prompt_id, r.model_surface))::int AS cell_count
    FROM "app"."benchmark_run" r
    JOIN "app"."agg_coverage_by_cell" c
      ON c.prompt_id = r.prompt_id
     AND c.model_surface = r.model_surface
     AND c.window_days = 30
     AND c.meets_threshold = true
    WHERE r.submitted_by_user_id IS NOT NULL
      AND r.model_surface <> 'legacy_unverified'
    GROUP BY r.submitted_by_user_id
  `);

  for (const row of rows.rows) {
    if (!row.user_id) continue;
    for (const tier of COVERAGE_BADGE_TIERS) {
      if (row.cell_count >= tier.minCells) {
        await db.execute(sql`
          INSERT INTO "app"."member_badge" ("user_id", "badge_slug")
          VALUES (${row.user_id}, ${tier.slug})
          ON CONFLICT ("user_id", "badge_slug") DO NOTHING
        `);
      }
    }
  }
}
