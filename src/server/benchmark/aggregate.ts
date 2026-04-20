import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

const WINDOWS = [7, 30, 90] as const;

export async function rebuildBrandRankByPrompt(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_brand_rank_by_prompt"
      WHERE "window_days" = ${w};

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
      GROUP BY r.prompt_id, m.brand_id, r.model_id;
    `);
  }
}

export async function rebuildBrandTrendsByDay(db: DB): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."agg_brand_trends_by_day"
    WHERE "date" >= (CURRENT_DATE - INTERVAL '365 days');

    INSERT INTO "app"."agg_brand_trends_by_day" (
      "brand_id", "model_id", "category_id", "date", "mention_pct", "run_count", "updated_at"
    )
    SELECT
      m.brand_id,
      r.model_id,
      p.category_id,
      date_trunc('day', r.captured_at)::date AS d,
      (COUNT(DISTINCT r.id)::numeric / NULLIF((
        SELECT COUNT(*) FROM "app"."benchmark_run" r2
        WHERE r2.model_id = r.model_id
          AND date_trunc('day', r2.captured_at) = date_trunc('day', r.captured_at)
      ), 0)) * 100 AS mention_pct,
      COUNT(DISTINCT r.id)::int,
      now()
    FROM "app"."benchmark_brand_mention" m
    JOIN "app"."benchmark_run" r ON r.id = m.run_id
    JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
    WHERE m.brand_id IS NOT NULL
      AND r.extraction_status = 'done'
      AND r.captured_at >= now() - INTERVAL '365 days'
    GROUP BY m.brand_id, r.model_id, p.category_id, d;
  `);
}

export async function rebuildModelBiasMatrix(db: DB): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."agg_model_bias_matrix";

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
    GROUP BY prompt_id, model_id;
  `);
}

export async function rebuildAllAggregates(db: DB): Promise<{
  ok: true;
  durations: { rank: number; trends: number; matrix: number };
}> {
  const t0 = Date.now();
  await rebuildBrandRankByPrompt(db);
  const t1 = Date.now();
  await rebuildBrandTrendsByDay(db);
  const t2 = Date.now();
  await rebuildModelBiasMatrix(db);
  const t3 = Date.now();
  return {
    ok: true,
    durations: { rank: t1 - t0, trends: t2 - t1, matrix: t3 - t2 },
  };
}
