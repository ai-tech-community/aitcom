import { NextResponse } from "next/server";

import { announcePublishedStorylinesFromDb } from "@/server/news/announce-storylines-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Mails members about news stories published since this feature shipped.
 * One batch per call. Safe to run again: a story is claimed per member, and
 * `announced_at` is set only after the production fan-out finishes.
 *
 * Real members are emailed only when `STORYLINE_ANNOUNCE_FANOUT=on` and the
 * deploy is production. Every other environment can reach greg@klevox.com only.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/news-storyline-announce
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await announcePublishedStorylinesFromDb(process.env);
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[news-storyline-announce] failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
