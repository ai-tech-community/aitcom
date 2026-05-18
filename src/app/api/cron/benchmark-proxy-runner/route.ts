import { NextResponse } from "next/server";

import { db } from "@/server/db";
import type { ModelSurface } from "@/server/db/schema";

import { ENABLED_SURFACES, runOnSurface } from "@/server/benchmark/proxy";
import { createDrizzleProxyRunnerDb } from "@/server/benchmark/proxy-runner-drizzle";
import { runProxyRunnerTick } from "@/server/benchmark/proxy-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runProxyRunnerTick(
      createDrizzleProxyRunnerDb(db),
      runOnSurface,
      {
        enabledSurfaces: ENABLED_SURFACES,
        batchSize: Number(process.env.BENCHMARK_PROXY_BATCH_SIZE ?? "5"),
        budgetCentsBySurface: readBudgetsFromEnv(),
      },
    );

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[benchmark-proxy-runner] error", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}

/**
 * Reads daily-cent budgets from env vars of the form
 * BENCHMARK_BUDGET_CENTS_<SURFACE_UPPERCASE>. Surfaces without an env var
 * remain unconfigured (no budget cap).
 */
function readBudgetsFromEnv(): Partial<Record<ModelSurface, number>> {
  const result: Partial<Record<ModelSurface, number>> = {};
  for (const surface of ENABLED_SURFACES) {
    const key = `BENCHMARK_BUDGET_CENTS_${surface.toUpperCase()}`;
    const raw = process.env[key];
    if (raw === undefined) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      result[surface] = parsed;
    }
  }
  return result;
}
