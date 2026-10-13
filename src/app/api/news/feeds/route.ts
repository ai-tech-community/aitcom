import { NextResponse } from "next/server";

import { newsBotAuthorized } from "@/server/news/bot-auth";
import { addConfiguredNewsFeed } from "@/server/news/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Add an RSS or Atom feed without a deploy. The URL is fetched and must
 * parse as a feed with at least one story before it is stored.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"name":"Example AI","url":"https://example.com/feed.xml"}' \
 *     https://www.aitcommunity.org/api/news/feeds
 *
 * Set `enabled` to false on the `app.news_feed` row to stop fetching a
 * built-in feed. See docs/news-feeds.md.
 */
export async function POST(request: Request) {
  if (!newsBotAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const result = await addConfiguredNewsFeed(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(
    { inserted: result.inserted, name: result.name, url: result.url },
    { status: result.inserted ? 201 : 200 },
  );
}
