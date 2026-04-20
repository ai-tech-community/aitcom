export function computeBrandWeight(args: {
  agreementCount: number;
  medianAgreement: number;
}): number {
  if (args.medianAgreement <= 0) return 1.0;
  return Math.min(1.0, args.agreementCount / args.medianAgreement);
}

import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
type DB = typeof _db;

export async function recomputeRunWeights(db: DB): Promise<void> {
  await db.execute(sql`
    WITH agreement AS (
      SELECT
        r.id AS run_id,
        COUNT(DISTINCT r2.submitted_by_user_id) FILTER (
          WHERE m2.brand_id = m.brand_id
        ) AS brand_agreement,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY
          COUNT(DISTINCT r2.submitted_by_user_id)
        ) OVER (PARTITION BY r.prompt_id, r.model_id) AS median_agreement
      FROM "app"."benchmark_run" r
      JOIN "app"."benchmark_brand_mention" m ON m.run_id = r.id AND m.brand_id IS NOT NULL
      JOIN "app"."benchmark_run" r2 ON r2.prompt_id = r.prompt_id AND r2.model_id = r.model_id
        AND r2.captured_at >= now() - INTERVAL '30 days'
      JOIN "app"."benchmark_brand_mention" m2 ON m2.run_id = r2.id
      WHERE r.captured_at >= now() - INTERVAL '30 days'
      GROUP BY r.id, r.prompt_id, r.model_id, m.brand_id
    )
    UPDATE "app"."benchmark_run" r
    SET weight = LEAST(1.0,
      COALESCE(
        (SELECT AVG(LEAST(1.0, a.brand_agreement::numeric / NULLIF(a.median_agreement, 0)))
         FROM agreement a WHERE a.run_id = r.id),
        1.0
      )
    )
    WHERE r.captured_at >= now() - INTERVAL '30 days'
      AND r.extraction_status = 'done';
  `);
}
