import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;
const WINDOWS = [7, 30, 90] as const;

/**
 * Visibility % per (brand, model, window). Denominator is runs in the brand's
 * primary category. Primary category derived inside the query:
 *   - If brand.category_ids is non-empty, the id within it with the most
 *     90-day mentions for this brand. Ties: first array element.
 *   - Else the most-mentioned inferred category across this brand's mentions
 *     over the last 90 days.
 *   - Else null (denominator falls back to all runs for that model).
 */
export async function rebuildAggBrandVisibilityByModel(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_brand_visibility_by_model"
      WHERE "window_days" = ${w}
    `);

    await db.execute(sql`
      WITH brand_category_counts AS (
        SELECT
          m.brand_id,
          cat.category_id,
          COUNT(DISTINCT r.id) AS cnt
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        CROSS JOIN LATERAL (
          SELECT unnest(ARRAY[p.category_id] || p.inferred_category_ids) AS category_id
        ) cat
        WHERE m.brand_id IS NOT NULL
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - INTERVAL '90 days'
        GROUP BY m.brand_id, cat.category_id
      ),
      brand_primary AS (
        SELECT DISTINCT ON (b.id)
          b.id AS brand_id,
          COALESCE(
            (SELECT bc.category_id
             FROM brand_category_counts bc
             WHERE bc.brand_id = b.id
               AND bc.category_id = ANY(b.category_ids)
             ORDER BY bc.cnt DESC,
                      array_position(b.category_ids, bc.category_id) ASC
             LIMIT 1),
            CASE WHEN cardinality(b.category_ids) > 0 THEN b.category_ids[1] ELSE NULL END,
            (SELECT bc.category_id
             FROM brand_category_counts bc
             WHERE bc.brand_id = b.id
             ORDER BY bc.cnt DESC
             LIMIT 1)
          ) AS primary_category_id
        FROM "app"."brand" b
      ),
      runs_by_model_category AS (
        SELECT
          r.model_id,
          cat.category_id,
          COUNT(DISTINCT r.id) AS runs_total
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        CROSS JOIN LATERAL (
          SELECT unnest(ARRAY[p.category_id] || p.inferred_category_ids) AS category_id
        ) cat
        WHERE r.extraction_status = 'done'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY r.model_id, cat.category_id
      ),
      runs_by_model_all AS (
        SELECT r.model_id, COUNT(DISTINCT r.id) AS runs_total
        FROM "app"."benchmark_run" r
        WHERE r.extraction_status = 'done'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY r.model_id
      ),
      brand_model_mentions AS (
        SELECT
          m.brand_id,
          r.model_id,
          COUNT(DISTINCT m.run_id)::int AS mentions_count,
          AVG(m.rank)::numeric(10,2) AS avg_rank,
          (SUM(CASE WHEN m.sentiment = 'positive' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sp,
          (SUM(CASE WHEN m.sentiment = 'neutral'  THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sn,
          (SUM(CASE WHEN m.sentiment = 'negative' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sx
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        WHERE m.brand_id IS NOT NULL
          AND r.extraction_status = 'done'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY m.brand_id, r.model_id
      )
      INSERT INTO "app"."agg_brand_visibility_by_model" (
        "brand_id", "model_id", "window_days", "primary_category_id",
        "mentions_count", "runs_total", "visibility_pct", "avg_rank",
        "sentiment_pos_pct", "sentiment_neu_pct", "sentiment_neg_pct", "updated_at"
      )
      SELECT
        bmm.brand_id,
        bmm.model_id,
        ${w} AS window_days,
        bp.primary_category_id,
        bmm.mentions_count,
        COALESCE(rmc.runs_total, rma.runs_total, 0)::int AS runs_total,
        CASE
          WHEN COALESCE(rmc.runs_total, rma.runs_total, 0) = 0 THEN 0
          ELSE ROUND(
            (bmm.mentions_count::numeric / COALESCE(rmc.runs_total, rma.runs_total)) * 100, 2
          )
        END AS visibility_pct,
        bmm.avg_rank,
        COALESCE(bmm.sp, 0),
        COALESCE(bmm.sn, 0),
        COALESCE(bmm.sx, 0),
        now()
      FROM brand_model_mentions bmm
      JOIN brand_primary bp ON bp.brand_id = bmm.brand_id
      LEFT JOIN runs_by_model_category rmc
        ON rmc.model_id = bmm.model_id AND rmc.category_id = bp.primary_category_id
      LEFT JOIN runs_by_model_all rma
        ON rma.model_id = bmm.model_id
    `);
  }
}

/**
 * Visibility % per (brand, model_surface, window). Mirrors
 * rebuildAggBrandVisibilityByModel but groups by model_surface and excludes
 * runs in `legacy_unverified` — those are pre-proxy contributor submissions
 * and are not trust-grade evidence (see ADR-0001, ADR-0004). The primary
 * category derivation is identical to the by-model rebuild.
 */
export async function rebuildAggBrandVisibilityBySurface(
  db: DB,
): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_brand_visibility_by_surface"
      WHERE "window_days" = ${w}
    `);

    await db.execute(sql`
      WITH brand_category_counts AS (
        SELECT
          m.brand_id,
          cat.category_id,
          COUNT(DISTINCT r.id) AS cnt
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        CROSS JOIN LATERAL (
          SELECT unnest(ARRAY[p.category_id] || p.inferred_category_ids) AS category_id
        ) cat
        WHERE m.brand_id IS NOT NULL
          AND r.extraction_status = 'done'
          AND r.model_surface <> 'legacy_unverified'
          AND r.captured_at >= now() - INTERVAL '90 days'
        GROUP BY m.brand_id, cat.category_id
      ),
      brand_primary AS (
        SELECT DISTINCT ON (b.id)
          b.id AS brand_id,
          COALESCE(
            (SELECT bc.category_id
             FROM brand_category_counts bc
             WHERE bc.brand_id = b.id
               AND bc.category_id = ANY(b.category_ids)
             ORDER BY bc.cnt DESC,
                      array_position(b.category_ids, bc.category_id) ASC
             LIMIT 1),
            CASE WHEN cardinality(b.category_ids) > 0 THEN b.category_ids[1] ELSE NULL END,
            (SELECT bc.category_id
             FROM brand_category_counts bc
             WHERE bc.brand_id = b.id
             ORDER BY bc.cnt DESC
             LIMIT 1)
          ) AS primary_category_id
        FROM "app"."brand" b
      ),
      runs_by_surface_category AS (
        SELECT
          r.model_surface,
          cat.category_id,
          COUNT(DISTINCT r.id) AS runs_total
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        CROSS JOIN LATERAL (
          SELECT unnest(ARRAY[p.category_id] || p.inferred_category_ids) AS category_id
        ) cat
        WHERE r.extraction_status = 'done'
          AND r.model_surface <> 'legacy_unverified'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY r.model_surface, cat.category_id
      ),
      runs_by_surface_all AS (
        SELECT r.model_surface, COUNT(DISTINCT r.id) AS runs_total
        FROM "app"."benchmark_run" r
        WHERE r.extraction_status = 'done'
          AND r.model_surface <> 'legacy_unverified'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY r.model_surface
      ),
      brand_surface_mentions AS (
        SELECT
          m.brand_id,
          r.model_surface,
          COUNT(DISTINCT m.run_id)::int AS mentions_count,
          AVG(m.rank)::numeric(10,2) AS avg_rank,
          (SUM(CASE WHEN m.sentiment = 'positive' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sp,
          (SUM(CASE WHEN m.sentiment = 'neutral'  THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sn,
          (SUM(CASE WHEN m.sentiment = 'negative' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(*),0)) * 100 AS sx
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        WHERE m.brand_id IS NOT NULL
          AND r.extraction_status = 'done'
          AND r.model_surface <> 'legacy_unverified'
          AND r.captured_at >= now() - (${w} || ' days')::interval
        GROUP BY m.brand_id, r.model_surface
      )
      INSERT INTO "app"."agg_brand_visibility_by_surface" (
        "brand_id", "model_surface", "window_days", "primary_category_id",
        "mentions_count", "runs_total", "visibility_pct", "avg_rank",
        "sentiment_pos_pct", "sentiment_neu_pct", "sentiment_neg_pct", "updated_at"
      )
      SELECT
        bsm.brand_id,
        bsm.model_surface,
        ${w} AS window_days,
        bp.primary_category_id,
        bsm.mentions_count,
        COALESCE(rsc.runs_total, rsa.runs_total, 0)::int AS runs_total,
        CASE
          WHEN COALESCE(rsc.runs_total, rsa.runs_total, 0) = 0 THEN 0
          ELSE ROUND(
            (bsm.mentions_count::numeric / COALESCE(rsc.runs_total, rsa.runs_total)) * 100, 2
          )
        END AS visibility_pct,
        bsm.avg_rank,
        COALESCE(bsm.sp, 0),
        COALESCE(bsm.sn, 0),
        COALESCE(bsm.sx, 0),
        now()
      FROM brand_surface_mentions bsm
      JOIN brand_primary bp ON bp.brand_id = bsm.brand_id
      LEFT JOIN runs_by_surface_category rsc
        ON rsc.model_surface = bsm.model_surface AND rsc.category_id = bp.primary_category_id
      LEFT JOIN runs_by_surface_all rsa
        ON rsa.model_surface = bsm.model_surface
    `);
  }
}

/**
 * Daily visibility per brand/model. Runs-total denominator is runs of that
 * model on that day (all categories — matches the existing
 * agg_brand_trends_by_day approach).
 */
export async function rebuildAggBrandVisibilityByDay(db: DB): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."agg_brand_visibility_by_day"
    WHERE "date" >= (CURRENT_DATE - INTERVAL '90 days')
  `);

  await db.execute(sql`
    WITH day_totals AS (
      SELECT
        r.model_id,
        date_trunc('day', r.captured_at)::date AS d,
        COUNT(DISTINCT r.id)::int AS runs_total
      FROM "app"."benchmark_run" r
      WHERE r.extraction_status = 'done'
        AND r.captured_at >= now() - INTERVAL '90 days'
      GROUP BY r.model_id, date_trunc('day', r.captured_at)::date
    ),
    brand_days AS (
      SELECT
        m.brand_id,
        r.model_id,
        date_trunc('day', r.captured_at)::date AS d,
        COUNT(DISTINCT r.id)::int AS mentions_count
      FROM "app"."benchmark_brand_mention" m
      JOIN "app"."benchmark_run" r ON r.id = m.run_id
      WHERE m.brand_id IS NOT NULL
        AND r.extraction_status = 'done'
        AND r.captured_at >= now() - INTERVAL '90 days'
      GROUP BY m.brand_id, r.model_id, date_trunc('day', r.captured_at)::date
    )
    INSERT INTO "app"."agg_brand_visibility_by_day" (
      "brand_id", "date", "model_id",
      "mentions_count", "runs_total", "updated_at"
    )
    SELECT
      bd.brand_id,
      bd.d,
      bd.model_id,
      bd.mentions_count,
      dt.runs_total,
      now()
    FROM brand_days bd
    JOIN day_totals dt ON dt.model_id = bd.model_id AND dt.d = bd.d
  `);
}
