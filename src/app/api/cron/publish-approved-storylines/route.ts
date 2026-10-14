import { NextResponse } from "next/server";

import { publishApprovedEditorialDrafts } from "@/server/news/publish-approved-storylines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * One-off after deploy. Publishes editorial drafts that were approved before
 * approval itself published the story. Safe to run again.
 *
 * Not on the Vercel schedule. Trigger it once production is live:
 *
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/publish-approved-storylines
 *
 * Run again while `scanned` is greater than zero and new rows appear in
 * `published`. Stories that fail publication checks stay in `skipped` and
 * are not modified.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await publishApprovedEditorialDrafts();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[publish-approved-storylines] backfill failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
