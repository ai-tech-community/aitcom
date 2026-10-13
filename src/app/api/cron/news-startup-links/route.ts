import { NextResponse } from "next/server";

import { backfillNewsStartupLinks } from "@/server/news/startup-links";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Links existing news rows and rumors to directory startups.
 *
 * The deploy migration only creates the join tables. This cron fills them
 * in batches and can be run again: a pair that is already stored is skipped.
 * Vercel calls GET hourly (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/news-startup-links
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillNewsStartupLinks();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[news-startup-links] backfill failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
