import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import type { ModelSurface } from "@/server/db/schema";
import {
  benchmarkPrompts,
  benchmarkRunSources,
  benchmarkRuns,
} from "@/server/db/schema";

import type { ProxyRunnerDb, QueuedRunRow } from "./proxy-runner";

type DB = typeof _db;

export function createDrizzleProxyRunnerDb(db: DB): ProxyRunnerDb {
  return {
    async recoverStuckRunning(staleAfterMs) {
      const cutoff = new Date(Date.now() - staleAfterMs);
      const updated = await db
        .update(benchmarkRuns)
        .set({ proxyStatus: "queued" })
        .where(
          and(
            eq(benchmarkRuns.proxyStatus, "running"),
            lt(benchmarkRuns.receivedAt, cutoff),
          ),
        )
        .returning({ id: benchmarkRuns.id });
      return updated.length;
    },

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

    async claimQueued(surfaces, limit) {
      if (surfaces.length === 0) return [];

      // Atomic claim: a single UPDATE ... FROM (SELECT ... FOR UPDATE SKIP
      // LOCKED) ... RETURNING. This locks rows, flips their status to
      // 'running', and returns the joined prompt text all in one round trip,
      // safe under concurrent ticks.
      const claimed = await db.execute<{
        run_id: string;
        prompt_id: string;
        prompt_text: string;
        locale: string;
        model_surface: ModelSurface;
      }>(sql`
        WITH claimed AS (
          SELECT r.id
          FROM ${benchmarkRuns} r
          WHERE r.proxy_status = 'queued'
            AND r.model_surface IN (${sql.join(
              surfaces.map((s) => sql`${s}`),
              sql`, `,
            )})
          ORDER BY r.created_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        ),
        updated AS (
          UPDATE ${benchmarkRuns} r
          SET proxy_status = 'running'
          FROM claimed c
          WHERE r.id = c.id
          RETURNING r.id, r.prompt_id, r.locale, r.model_surface
        )
        SELECT
          u.id AS run_id,
          u.prompt_id,
          p.text AS prompt_text,
          u.locale,
          u.model_surface
        FROM updated u
        JOIN ${benchmarkPrompts} p ON p.id = u.prompt_id
      `);

      const rows = (
        claimed as unknown as {
          rows: Array<{
            run_id: string;
            prompt_id: string;
            prompt_text: string;
            locale: string;
            model_surface: ModelSurface;
          }>;
        }
      ).rows;

      return rows.map(
        (r): QueuedRunRow => ({
          runId: r.run_id,
          promptId: r.prompt_id,
          promptText: r.prompt_text,
          locale: r.locale,
          modelSurface: r.model_surface,
        }),
      );
    },

    async markSuccess(runId, result) {
      await db.transaction(async (tx) => {
        await tx
          .update(benchmarkRuns)
          .set({
            proxyStatus: "done",
            extractionStatus: "pending",
            rawAnswer: result.rawAnswer,
            modelId: result.providerModelId,
            modelVersion: result.providerModelVersion ?? null,
            providerResponseId: result.providerResponseId,
            costCents: result.costCents,
            proxyResponseRaw: result.providerResponseRaw as
              | Record<string, unknown>
              | null,
            capturedAt: new Date(),
          })
          .where(eq(benchmarkRuns.id, runId));

        if (result.sources.length > 0) {
          await tx.insert(benchmarkRunSources).values(
            result.sources.map((source) => ({
              runId,
              url: source.url,
              domain: source.domain,
              title: source.title,
              snippet: source.snippet,
              position: source.position,
              kind: source.kind,
              sourceType: source.sourceType,
              brandRelation: source.brandRelation,
              explicitCitation: source.explicitCitation,
            })),
          );
        }
      });
    },

    async markFailure(runId, error) {
      await db
        .update(benchmarkRuns)
        .set({
          proxyStatus: "failed",
          proxyResponseRaw: { error },
        })
        .where(
          and(
            eq(benchmarkRuns.id, runId),
            inArray(benchmarkRuns.proxyStatus, ["queued", "running"]),
          ),
        );
    },
  };
}

