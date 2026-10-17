import { NextResponse } from "next/server";

import { backfillNewsSectorDefaults } from "@/server/news/sectors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Fills news sectors that the deploy migration left null.
 *
 * The migration only adds the table and columns. This cron sets AI on
 * communities, feeds, and stories that have no sector yet, in batches,
 * and can be run again: a chosen sector is left alone. Vercel calls GET
 * every 15 minutes (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/news-sector-defaults
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillNewsSectorDefaults();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[news-sector-defaults] backfill failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
