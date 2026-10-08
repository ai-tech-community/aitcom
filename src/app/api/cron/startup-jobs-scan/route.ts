import { NextResponse } from "next/server";

import { scanAllStartupJobs } from "@/server/startups/scan-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily careers scan for listed startups that have a verified jobsUrl.
 * Unscanned companies first, then open roles and known ATS boards, then
 * never-hiring companies, oldest jobs_scanned_at within each group. Eight
 * companies run at once, with at most two requests to one ATS host, until
 * STARTUP_JOBS_SCAN_BUDGET_MS. New fetches stop before that deadline.
 * Companies that come back empty or fail several scans in a row wait
 * longer, at most seven days. The response and the run log report
 * companies scanned, roles opened and closed, and time spent.
 * A live empty ATS board writes open_role_count = 0. A failed fetch does not
 * close roles. A non-ATS page that would drop all or most open roles is held
 * and writes nothing. Per-company isolation: one failure must not abort the batch.
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
