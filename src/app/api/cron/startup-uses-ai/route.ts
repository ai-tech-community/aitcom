import { NextResponse } from "next/server";

import { backfillStartupUsesAi } from "@/server/startups/uses-ai-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Marks historical directory rows as using AI.
 *
 * The deploy migration only adds a nullable `uses_ai` column. This cron
 * sets it true for companies listed while the directory was AI-only, in
 * batches, and can be run again: a row already true or false is skipped.
 * Vercel calls GET every 15 minutes (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/startup-uses-ai
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillStartupUsesAi();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[startup-uses-ai] backfill failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
