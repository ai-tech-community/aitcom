import { NextResponse } from "next/server";

import { revalidateNewsTable } from "@/server/news/cache";
import { ingestConfiguredNewsFeeds } from "@/server/news/ingest-feeds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Fetches the configured technology and business news feeds and stores new
 * article URLs. AI sections stay in the list. A story is not dropped
 * because it is not about AI.
 *
 * The news table is empty until this runs. Vercel calls GET once a day
 * (see vercel.json) and sends `Authorization: Bearer $CRON_SECRET`.
 * Feeds are fetched a few at a time, each with its own timeout, and
 * summaries stop once the run's time budget is spent. To run the first
 * ingest without waiting for that slot:
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
    revalidateNewsTable();
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
