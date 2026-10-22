import { NextResponse } from "next/server";

import { stripStoredEventListingPolicy } from "@/server/events/listing-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Strips internal listing-policy notes from stored event summaries and
 * descriptions. Idempotent and batched: a clean row is left alone, and a
 * later run finishes whatever the previous run did not reach. This is not
 * a migration. Vercel calls GET every 15 minutes (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.aitcommunity.org/api/cron/event-listing-policy
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await stripStoredEventListingPolicy();
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[event-listing-policy] cleanup failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
