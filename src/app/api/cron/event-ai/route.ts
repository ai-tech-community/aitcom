import { NextResponse } from "next/server";

import { backfillEventAi } from "@/server/events/event-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Classifies events as AI or not.
 *
 * The deploy migration only adds a nullable `is_ai` column. This cron sets
 * it from the stored title, summary, and description, in batches, and can
 * be run again: a row already true or false is skipped. A non-AI reading is
 * stored and the event stays listed. Vercel calls GET every 15 minutes
 * (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/event-ai
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillEventAi();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[event-ai] backfill failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
