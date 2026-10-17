import { NextResponse } from "next/server";

import { backfillPublishedContributions } from "@/server/news/contributions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Credits published stories that already have a contributing member.
 * Safe to run again: a story that already has a published point row is skipped.
 * Topics and credits are taken from the technology and business archive.
 * A story is not skipped because it is not tagged AI. Vercel calls GET
 * daily with `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await backfillPublishedContributions();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[news-contributions] backfill failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
