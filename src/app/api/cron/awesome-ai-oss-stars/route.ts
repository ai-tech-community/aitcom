import { NextResponse } from "next/server";

import { refreshStoredAwesomeStars } from "@/server/awesome-ai-oss/refresh-stars-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily GitHub/GitLab star refresh for Awesome AI OSS cards.
 * Soft-fails per repo: a 403/404/timeout leaves star_count untouched
 * rather than writing 0 or a guessed number.
 */
export async function GET(request: Request) {
  if (
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshStoredAwesomeStars();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[awesome-ai-oss-stars] error", err);
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 200 },
    );
  }
}
