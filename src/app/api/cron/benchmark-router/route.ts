import { NextResponse } from "next/server";

import { db } from "@/server/db";
import type { ModelSurface } from "@/server/db/schema";

import { ENABLED_SURFACES } from "@/server/benchmark/proxy";
import { runBenchmarkRouterTick } from "@/server/benchmark/router";
import { createDrizzleRouterDb } from "@/server/benchmark/router-drizzle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runBenchmarkRouterTick(db, createDrizzleRouterDb(db), {
      enabledSurfaces: ENABLED_SURFACES,
      staleAfterDays: Number(
        process.env.BENCHMARK_ROUTER_STALE_AFTER_DAYS ?? "14",
      ),
      perSurfaceLimit: Number(
        process.env.BENCHMARK_ROUTER_PER_SURFACE_LIMIT ?? "10",
      ),
      budgetCentsBySurface: readBudgetsFromEnv(),
    });

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[benchmark-router] error", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}

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
