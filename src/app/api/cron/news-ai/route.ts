import { NextResponse } from "next/server";

import { backfillNewsItemAi } from "@/server/news/item-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Classifies collected news as AI or not.
 *
 * The deploy migration only adds a nullable `is_ai` column. This cron sets
 * it from the stored title and source excerpt, in batches, and can be run
 * again: a row already true or false is skipped. Ambiguous text stays null.
 * A non-AI reading is stored and the story stays listed. Vercel calls GET
 * every 15 minutes (see vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/news-ai
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await backfillNewsItemAi();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[news-ai] backfill failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
