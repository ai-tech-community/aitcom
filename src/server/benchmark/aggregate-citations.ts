import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;
const WINDOWS = [7, 30, 90] as const;

export async function rebuildAggCitationByBrand(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_citation_by_brand"
      WHERE "window_days" = ${w}
    `);

    await db.execute(sql`
      INSERT INTO "app"."agg_citation_by_brand" (
        "brand_id", "category_id", "model_id", "window_days",
        "domain", "citation_count", "last_seen_at", "updated_at"
      )
      SELECT
        m.brand_id,
        NULL::uuid AS category_id,
        r.model_id,
        ${w} AS window_days,
        c.domain,
        COUNT(DISTINCT c.run_id)::int AS citation_count,
        MAX(c.created_at) AS last_seen_at,
        now()
      FROM "app"."benchmark_citation" c
      JOIN "app"."benchmark_run" r ON r.id = c.run_id
      JOIN "app"."benchmark_brand_mention" m ON m.run_id = r.id
      WHERE m.brand_id IS NOT NULL
        AND r.extraction_status = 'done'
        AND r.captured_at >= now() - (${w} || ' days')::interval
      GROUP BY m.brand_id, r.model_id, c.domain
      HAVING COUNT(DISTINCT c.run_id) > 0
    `);

    // Cap to top-20 domains per (brand, model, window) using row-ranked delete.
    await db.execute(sql`
      WITH ranked AS (
        SELECT ctid, ROW_NUMBER() OVER (
          PARTITION BY "brand_id", "model_id", "window_days"
          ORDER BY "citation_count" DESC, "domain" ASC
        ) AS rn
        FROM "app"."agg_citation_by_brand"
        WHERE "window_days" = ${w}
      )
      DELETE FROM "app"."agg_citation_by_brand" target
      USING ranked
      WHERE target.ctid = ranked.ctid AND ranked.rn > 20
    `);
  }
}
