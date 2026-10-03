import { NextResponse, after } from "next/server";

import { runWorkerTick } from "@/server/collectors/executor";
import { collectorsEnabled } from "@/server/collectors/flags";
import { liveExecutorDeps } from "@/server/collectors/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Only callers holding CRON_SECRET; an unset secret refuses everyone. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return (
    !!secret && request.headers.get("authorization") === `Bearer ${secret}`
  );
}

/**
 * Data-collector worker (ADR-0040). The Vercel cron calls GET every minute
 * and is the guarantee that queued runs execute; GET waits for the tick.
 * POST is the best-effort kick sent right after a run is queued: it answers
 * 202 at once and works in after(), so the kicker's short timeout never
 * cancels a run.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!collectorsEnabled()) {
    return NextResponse.json({ skipped: "collectors off" });
  }
  try {
    const result = await runWorkerTick(liveExecutorDeps());
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[collector-worker] tick failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!collectorsEnabled()) {
    return NextResponse.json({ skipped: "collectors off" });
  }
  after(async () => {
    try {
      await runWorkerTick(liveExecutorDeps());
    } catch (err) {
      console.error("[collector-worker] kicked tick failed", err);
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
