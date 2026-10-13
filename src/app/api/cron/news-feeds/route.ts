import { NextResponse } from "next/server";

import { ingestConfiguredNewsFeeds } from "@/server/news/ingest-feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Fetches the configured AI news feeds and stores new article URLs.
 *
 * The news table is empty until this runs. Nothing else queues a feed:
 * the collector worker only drains runs a person starts by hand, and no
 * feed address was configured before this route.
 *
 * Vercel calls GET every six hours (see vercel.json) and sends
 * `Authorization: Bearer $CRON_SECRET`. To run the first ingest
 * without waiting for that slot:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/news-feeds
 *
 * The route stores only what those feeds return. It does not insert
 * placeholder stories.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await ingestConfiguredNewsFeeds();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[news-feeds] ingest failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
