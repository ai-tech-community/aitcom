import { NextResponse } from "next/server";

import { scanAllStartupJobs } from "@/server/startups/scan-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily careers scan for listed startups that have a verified jobsUrl.
 * Reads every jobsUrl company oldest-first until STARTUP_JOBS_SCAN_BUDGET_MS.
 * A live empty board writes open_role_count = 0. A failed fetch does not.
 * Per-company isolation: one careers page failing must not abort the batch.
 * Low-confidence extracts stay pending_review and never hit the public table.
 */
export async function GET(request: Request) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await scanAllStartupJobs();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[startup-jobs-scan] error", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 200 },
    );
  }
}
