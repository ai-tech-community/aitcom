import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

const WINDOWS = [7, 30, 90] as const;

// Neon HTTP driver rejects multi-statement queries. Each DELETE and INSERT
// lives in its own db.execute(sql`...`) call.

export async function rebuildBrandRankByPrompt(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_brand_rank_by_prompt"
      WHERE "window_days" = ${w}
    `);

    await db.execute(sql`
      INSERT INTO "app"."agg_brand_rank_by_prompt" (
        "prompt_id", "brand_id", "model_id", "window_days",
        "mention_count", "weighted_score", "avg_rank",
        "sentiment_positive_pct", "sentiment_neutral_pct", "sentiment_negative_pct",
        "updated_at"
      )
      SELECT
        r.prompt_id,
        m.brand_id,
        r.model_id,
        ${w} AS window_days,
        COUNT(*)::int AS mention_count,
        SUM(r.weight) AS weighted_score,
        AVG(m.rank)::numeric(10,2) AS avg_rank,
        (SUM(CASE WHEN m.sentiment = 'positive' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sp,
        (SUM(CASE WHEN m.sentiment = 'neutral'  THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sn,
        (SUM(CASE WHEN m.sentiment = 'negative' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sx,
        now()
      FROM "app"."benchmark_brand_mention" m
      JOIN "app"."benchmark_run" r ON r.id = m.run_id
      WHERE m.brand_id IS NOT NULL
        AND r.captured_at >= now() - (${w} || ' days')::interval
        AND r.extraction_status = 'done'
      GROUP BY r.prompt_id, m.brand_id, r.model_id
    `);
  }
}

export async function rebuildBrandTrendsByDay(db: DB): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."agg_brand_trends_by_day"
    WHERE "date" >= (CURRENT_DATE - INTERVAL '365 days')
  `);

  await db.execute(sql`
    WITH day_totals AS (
      SELECT
        model_id,
        date_trunc('day', captured_at)::date AS d,
        COUNT(*)::int AS total
      FROM "app"."benchmark_run"
      WHERE extraction_status = 'done'
        AND captured_at >= now() - INTERVAL '365 days'
      GROUP BY model_id, date_trunc('day', captured_at)::date
    ),
    brand_days AS (
      SELECT
        m.brand_id,
        r.model_id,
        p.category_id,
        date_trunc('day', r.captured_at)::date AS d,
        COUNT(DISTINCT r.id)::int AS run_count
      FROM "app"."benchmark_brand_mention" m
      JOIN "app"."benchmark_run" r ON r.id = m.run_id
      JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
      WHERE m.brand_id IS NOT NULL
        AND r.extraction_status = 'done'
        AND r.captured_at >= now() - INTERVAL '365 days'
      GROUP BY m.brand_id, r.model_id, p.category_id, date_trunc('day', r.captured_at)::date
    )
    INSERT INTO "app"."agg_brand_trends_by_day" (
      "brand_id", "model_id", "category_id", "date", "mention_pct", "run_count", "updated_at"
    )
    SELECT
      bd.brand_id,
      bd.model_id,
      bd.category_id,
      bd.d,
      (bd.run_count::numeric / NULLIF(dt.total, 0)) * 100,
      bd.run_count,
      now()
    FROM brand_days bd
    JOIN day_totals dt ON dt.model_id = bd.model_id AND dt.d = bd.d
  `);
}

export async function rebuildModelBiasMatrix(db: DB): Promise<void> {
  await db.execute(sql`DELETE FROM "app"."agg_model_bias_matrix"`);

  await db.execute(sql`
    INSERT INTO "app"."agg_model_bias_matrix" ("prompt_id", "model_id", "top_brand_ids", "updated_at")
    SELECT
      prompt_id,
      model_id,
      jsonb_agg(brand_id ORDER BY weighted_score DESC) FILTER (WHERE rn <= 5) AS top_brand_ids,
      now()
    FROM (
      SELECT
        prompt_id, model_id, brand_id, weighted_score,
        ROW_NUMBER() OVER (PARTITION BY prompt_id, model_id ORDER BY weighted_score DESC) AS rn
      FROM "app"."agg_brand_rank_by_prompt"
      WHERE window_days = 30
    ) t
    GROUP BY prompt_id, model_id
  `);
}

export async function rebuildTopBrandByCategory(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_top_brand_by_category"
      WHERE "window_days" = ${w} AND "model_scope" = 'all'
    `);

    await db.execute(sql`
      WITH category_totals AS (
        SELECT
          p.category_id,
          COUNT(DISTINCT r.id) AS total_answers,
          COUNT(DISTINCT r.model_id) AS models_sampled
        FROM "app"."benchmark_run" r
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        WHERE r.captured_at >= now() - (${w} || ' days')::interval
          AND r.extraction_status = 'done'
        GROUP BY p.category_id
      ),
      brand_totals AS (
        SELECT
          p.category_id,
          m.brand_id,
          b.slug AS brand_slug,
          b.canonical_name AS brand_canonical_name,
          COUNT(DISTINCT r.id) AS mention_count
        FROM "app"."benchmark_brand_mention" m
        JOIN "app"."benchmark_run" r ON r.id = m.run_id
        JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
        JOIN "app"."brand" b ON b.id = m.brand_id
        WHERE m.brand_id IS NOT NULL
          AND r.captured_at >= now() - (${w} || ' days')::interval
          AND r.extraction_status = 'done'
        GROUP BY p.category_id, m.brand_id, b.slug, b.canonical_name
      ),
      ranked AS (
        SELECT
          bt.category_id,
          bt.brand_id,
          bt.brand_slug,
          bt.brand_canonical_name,
          bt.mention_count,
          ROW_NUMBER() OVER (
            PARTITION BY bt.category_id
            ORDER BY bt.mention_count DESC, bt.brand_canonical_name ASC
          ) AS rn
        FROM brand_totals bt
      ),
      top_two AS (
        SELECT
          r1.category_id,
          r1.brand_id,
          r1.brand_slug,
          r1.brand_canonical_name,
          r1.mention_count,
          r2.brand_id AS runner_up_brand_id,
          r2.brand_canonical_name AS runner_up_canonical_name,
          r2.mention_count AS runner_up_mention_count
        FROM ranked r1
        LEFT JOIN ranked r2
          ON r2.category_id = r1.category_id AND r2.rn = 2
        WHERE r1.rn = 1
      )
      INSERT INTO "app"."agg_top_brand_by_category" (
        "category_id", "window_days", "model_scope",
        "brand_id", "brand_slug", "brand_canonical_name",
        "mention_count", "total_answers", "share_pct",
        "runner_up_brand_id", "runner_up_canonical_name", "runner_up_share_pct",
        "models_sampled", "updated_at"
      )
      SELECT
        tt.category_id,
        ${w} AS window_days,
        'all' AS model_scope,
        tt.brand_id,
        tt.brand_slug,
        tt.brand_canonical_name,
        tt.mention_count,
        ct.total_answers,
        ROUND((tt.mention_count::numeric / NULLIF(ct.total_answers, 0)) * 100, 2) AS share_pct,
        tt.runner_up_brand_id,
        tt.runner_up_canonical_name,
        CASE WHEN tt.runner_up_brand_id IS NULL THEN NULL
             ELSE ROUND((tt.runner_up_mention_count::numeric / NULLIF(ct.total_answers, 0)) * 100, 2)
        END AS runner_up_share_pct,
        ct.models_sampled,
        now()
      FROM top_two tt
      JOIN category_totals ct ON ct.category_id = tt.category_id
    `);
  }
}

export async function rebuildAllAggregates(db: DB): Promise<{
  ok: true;
  durations: { rank: number; trends: number; matrix: number; hero: number };
}> {
  const t0 = Date.now();
  await rebuildBrandRankByPrompt(db);
  const t1 = Date.now();
  await rebuildBrandTrendsByDay(db);
  const t2 = Date.now();
  await rebuildModelBiasMatrix(db);
  const t3 = Date.now();
  await rebuildTopBrandByCategory(db);
  const t4 = Date.now();
  return {
    ok: true,
    durations: {
      rank: t1 - t0,
      trends: t2 - t1,
      matrix: t3 - t2,
      hero: t4 - t3,
    },
  };
}
