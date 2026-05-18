import { and, eq, gte, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import type { ModelSurface } from "@/server/db/schema";
import { benchmarkRuns } from "@/server/db/schema";

import type { RefreshCandidate, RouterDb } from "./router";

type DB = typeof _db;

export function createDrizzleRouterDb(db: DB): RouterDb {
  return {
    async spentTodayBySurface() {
      const startOfUtcDay = new Date();
      startOfUtcDay.setUTCHours(0, 0, 0, 0);
      const rows = await db
        .select({
          surface: benchmarkRuns.modelSurface,
          spent: sql<number>`COALESCE(SUM(${benchmarkRuns.costCents}), 0)`,
        })
        .from(benchmarkRuns)
        .where(
          and(
            eq(benchmarkRuns.proxyStatus, "done"),
            gte(benchmarkRuns.capturedAt, startOfUtcDay),
          ),
        )
        .groupBy(benchmarkRuns.modelSurface);

      const map = new Map<ModelSurface, number>();
      for (const row of rows) {
        map.set(row.surface, Number(row.spent));
      }
      return map;
    },

    async findRefreshCandidates({
      surface,
      allowedLocales,
      staleAfterDays,
      limit,
    }) {
      if (allowedLocales.length === 0) return [];

      // Approved prompts in an allowed locale, with no current in-flight
      // queued/running row on this surface, whose newest done run on this
      // surface is missing or older than the threshold. Ordering matches
      // orderRefreshCandidates: missing-entirely (newest_done IS NULL)
      // ranks above stale, then oldest first.
      const rows = await db.execute<{
        prompt_id: string;
        prompt_locale: string;
        newest_done_at: Date | null;
      }>(sql`
        SELECT
          p.id AS prompt_id,
          p.locale AS prompt_locale,
          MAX(r.captured_at) FILTER (
            WHERE r.model_surface = ${surface} AND r.proxy_status = 'done'
          ) AS newest_done_at
        FROM "app"."benchmark_prompt" p
        LEFT JOIN "app"."benchmark_run" r ON r.prompt_id = p.id
        WHERE p.status = 'approved'
          AND p.locale IN (${sql.join(
            allowedLocales.map((l) => sql`${l}`),
            sql`, `,
          )})
          AND NOT EXISTS (
            SELECT 1 FROM "app"."benchmark_run" r2
            WHERE r2.prompt_id = p.id
              AND r2.model_surface = ${surface}
              AND r2.proxy_status IN ('queued', 'running')
          )
        GROUP BY p.id, p.locale
        HAVING
          MAX(r.captured_at) FILTER (
            WHERE r.model_surface = ${surface} AND r.proxy_status = 'done'
          ) IS NULL
          OR MAX(r.captured_at) FILTER (
            WHERE r.model_surface = ${surface} AND r.proxy_status = 'done'
          ) < NOW() - (${staleAfterDays} || ' days')::interval
        ORDER BY
          (MAX(r.captured_at) FILTER (
            WHERE r.model_surface = ${surface} AND r.proxy_status = 'done'
          ) IS NULL) DESC,
          MAX(r.captured_at) FILTER (
            WHERE r.model_surface = ${surface} AND r.proxy_status = 'done'
          ) ASC NULLS FIRST,
          p.id ASC
        LIMIT ${limit}
      `);

      const data = (
        rows as unknown as {
          rows: Array<{
            prompt_id: string;
            prompt_locale: string;
            newest_done_at: Date | string | null;
          }>;
        }
      ).rows;

      return data.map(
        (r): RefreshCandidate => ({
          promptId: r.prompt_id,
          promptLocale: r.prompt_locale,
          newestDoneAt:
            r.newest_done_at === null
              ? null
              : r.newest_done_at instanceof Date
                ? r.newest_done_at
                : new Date(r.newest_done_at),
        }),
      );
    },
  };
}
