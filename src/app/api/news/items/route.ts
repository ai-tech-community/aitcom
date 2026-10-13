import { NextResponse } from "next/server";

import { newsBotAuthorized } from "@/server/news/bot-auth";
import { submitConfiguredNewsItem } from "@/server/news/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Store one real story a bot has already read.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"url":"https://example.com/story","title":"Headline","source":"Example","published_at":"2026-10-13T12:00:00.000Z","summary":"The source excerpt."}' \
 *     https://www.aitcommunity.org/api/news/items
 *
 * `summary` must be text from the source. A URL already stored returns
 * `inserted: false`. See docs/news-feeds.md.
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
  const result = await submitConfiguredNewsItem(body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(
    { inserted: result.inserted, url: result.url },
    { status: result.inserted ? 201 : 200 },
  );
}
